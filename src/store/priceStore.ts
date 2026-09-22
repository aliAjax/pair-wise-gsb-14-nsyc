// 状态层：编排规则与存储。界面只调用这里的动作，不直接操作 localStorage。

import { defineStore } from "pinia";
import {
  validateApproval,
  validateBusiness,
  validateFields,
  VersionStatus,
  DraftInput
} from "../rules/validation";
import type { RuleViolation } from "../rules/validation";
import {
  applyTaxAdjustment,
  checkTax,
  reverseSplit,
  yuanToFen
} from "../rules/tax";
import type { AmountSplit } from "../rules/tax";
import {
  loadBlocked,
  loadDocuments,
  resetDocuments,
  saveBlocked,
  saveDocuments
} from "./repository";
import type { BlockedAttempt, PriceDocument, PriceVersion } from "./types";
import { currentVersion, isActive } from "./types";

export interface ActionResult {
  ok: boolean;
  violations: RuleViolation[];
}

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

/** 组装当前金额拆分（含财务税额调整） */
export function splitOf(version: PriceVersion): AmountSplit {
  const base = reverseSplit(version.grossFen, version.ratePercent);
  if (!version.taxAdjusted) return base;
  return applyTaxAdjustment(base, version.taxFen);
}

interface State {
  documents: PriceDocument[];
  blocked: BlockedAttempt[];
}

export const usePriceStore = defineStore("price-review", {
  state: (): State => ({
    documents: loadDocuments(),
    blocked: loadBlocked()
  }),

  getters: {
    /** 单据按更新时间倒序 */
    orderedDocuments(state): PriceDocument[] {
      return [...state.documents].sort(
        (a, b) =>
          new Date(currentVersion(b).createdAt).getTime() -
          new Date(currentVersion(a).createdAt).getTime()
      );
    },
    pendingCount(state): number {
      return state.documents.filter((d) => currentVersion(d).status === "pending").length;
    },
    approvedCount(state): number {
      return state.documents.filter((d) => currentVersion(d).status === "approved").length;
    },
    frozenVersionCount(state): number {
      return state.documents.reduce(
        (acc, doc) =>
          acc + doc.versions.filter((v) => v.status === "approved" || v.status === "superseded").length,
        0
      );
    },
    /** 全部已冻结版本（发布 + 已更正），供版本一致性视图使用 */
    frozenVersions(state): { doc: PriceDocument; version: PriceVersion }[] {
      const rows: { doc: PriceDocument; version: PriceVersion }[] = [];
      for (const doc of state.documents) {
        for (const version of doc.versions) {
          if (version.status === "approved" || version.status === "superseded") {
            rows.push({ doc, version });
          }
        }
      }
      return rows;
    }
  },

  actions: {
    persist() {
      saveDocuments(this.documents);
    },
    persistBlocked() {
      saveBlocked(this.blocked);
    },

    /** 同站同油品同生效日是否已有有效版本（排除指定单据自身） */
    findDuplicate(
      station: string,
      fuel: string,
      effectiveDate: string,
      excludeDocId?: string
    ): PriceDocument | undefined {
      return this.documents.find(
        (doc) =>
          doc.id !== excludeDocId &&
          doc.station === station &&
          doc.fuel === fuel &&
          doc.effectiveDate === effectiveDate &&
          isActive(currentVersion(doc))
      );
    },

    /** 对当前草稿实时倒推（供界面金额拆分预览） */
    previewSplit(priceText: string, ratePercent: number | null): AmountSplit | null {
      const fen = yuanToFen(priceText);
      if (fen === null || fen <= 0 || ratePercent === null) return null;
      return reverseSplit(fen, ratePercent);
    },

    recordBlocked(
      action: BlockedAttempt["action"],
      input: {
        station: string;
        fuel: string;
        effectiveDate: string;
        split: AmountSplit | null;
      },
      violations: RuleViolation[]
    ) {
      const attempt: BlockedAttempt = {
        id: uid("blk"),
        at: new Date().toISOString(),
        station: input.station,
        fuel: input.fuel,
        effectiveDate: input.effectiveDate,
        grossFen: input.split?.grossFen ?? 0,
        netFen: input.split?.netFen ?? 0,
        taxFen: input.split?.taxFen ?? 0,
        diffFen: input.split?.diffFen ?? 0,
        action,
        ruleCodes: violations.map((v) => v.rule),
        messages: violations.map((v) => v.message)
      };
      this.blocked = [attempt, ...this.blocked].slice(0, 50);
      this.persistBlocked();
    },

    clearBlocked() {
      this.blocked = [];
      this.persistBlocked();
    },

    buildVersion(
      input: DraftInput,
      split: AmountSplit,
      versionNo: number,
      status: VersionStatus,
      createdAt: string
    ): PriceVersion {
      const tax = checkTax(split, input.ratePercent as number);
      return {
        id: uid("ver"),
        versionNo,
        status,
        ratePercent: input.ratePercent as number,
        grossFen: split.grossFen,
        netFen: split.netFen,
        taxFen: split.taxFen,
        independentTaxFen: split.independentTaxFen,
        diffFen: split.diffFen,
        taxAdjusted: false,
        abnormal: tax.abnormal,
        abnormalCodes: tax.issueCodes,
        basis: "",
        operator: input.operator.trim(),
        reviewer: "",
        reviewNote: "",
        createdAt,
        submittedAt: status === "pending" ? createdAt : "",
        reviewedAt: ""
      };
    },

    /** 提交调价单（新建）。校验通过：正常单待复核，异常单也可进入待复核但必须补依据 */
    submitDraft(input: DraftInput): ActionResult {
      const fieldViolations = validateFields(input);
      const fen = yuanToFen(input.priceText);
      if (fen !== null && fen <= 0) {
        fieldViolations.push({ rule: "R2_PRICE_FORMAT", message: "含税售价必须大于零。" });
      }
      const split = fen !== null && input.ratePercent !== null ? reverseSplit(fen, input.ratePercent) : null;

      let business: RuleViolation[] = [];
      if (split && input.ratePercent !== null) {
        const duplicate = !!this.findDuplicate(input.station, input.fuel, input.effectiveDate);
        business = validateBusiness({ duplicate }, split, input.ratePercent).violations;
      }

      const violations = [...fieldViolations, ...business];
      if (violations.length) {
        if (split) this.recordBlocked("submit", { ...input, split }, violations);
        return { ok: false, violations };
      }
      if (!split) {
        return {
          ok: false,
          violations: [{ rule: "R1_FIELDS", message: "金额或税率无法计算，请检查输入。" }]
        };
      }

      const now = new Date().toISOString();
      const version = this.buildVersion(input, split, 1, "pending", now);
      const doc: PriceDocument = {
        id: uid("doc"),
        station: input.station,
        fuel: input.fuel,
        effectiveDate: input.effectiveDate,
        versions: [version]
      };
      this.documents = [doc, ...this.documents];
      this.persist();
      return { ok: true, violations: [] };
    },

    /** 草稿保存：允许缺字段（仅在键不冲突时保存） */
    saveDraft(input: DraftInput): ActionResult {
      const fen = yuanToFen(input.priceText);
      if (input.priceText.trim() && fen === null) {
        const violations: RuleViolation[] = [{ rule: "R2_PRICE_FORMAT", message: "含税售价最多两位小数。" }];
        this.recordBlocked("submit", { ...input, split: null }, violations);
        return { ok: false, violations };
      }
      if (!input.station || !input.fuel || !input.effectiveDate || fen === null || input.ratePercent === null) {
        const violations: RuleViolation[] = [{ rule: "R1_FIELDS", message: "草稿需要站点、油品、含税售价、税率和生效日齐全。" }];
        this.recordBlocked("submit", { ...input, split: null }, violations);
        return { ok: false, violations };
      }
      const duplicate = this.findDuplicate(input.station, input.fuel, input.effectiveDate);
      if (duplicate) {
        const violations: RuleViolation[] = [{ rule: "R4_UNIQUE", message: "同站同油品同生效日只能一条；如需变更请对原单发起更正。" }];
        this.recordBlocked("submit", { ...input, split: reverseSplit(fen, input.ratePercent) }, violations);
        return { ok: false, violations };
      }
      const now = new Date().toISOString();
      const version = this.buildVersion(input, reverseSplit(fen, input.ratePercent), 1, "draft", now);
      const doc: PriceDocument = {
        id: uid("doc"),
        station: input.station,
        fuel: input.fuel,
        effectiveDate: input.effectiveDate,
        versions: [version]
      };
      this.documents = [doc, ...this.documents];
      this.persist();
      return { ok: true, violations: [] };
    },

    /** 草稿/驳回单修改后重新提交（同一版本） */
    resubmit(docId: string, input: DraftInput): ActionResult {
      const doc = this.documents.find((d) => d.id === docId);
      if (!doc) return { ok: false, violations: [] };
      const version = currentVersion(doc);
      if (version.status !== "draft" && version.status !== "rejected") {
        return {
          ok: false,
          violations: [{ rule: "R8_FROZEN", message: "当前状态不可修改；已发布版本只能另立版本更正。" }]
        };
      }
      const fen = yuanToFen(input.priceText);
      const fieldViolations = validateFields(input);
      if (fen !== null && fen <= 0) fieldViolations.push({ rule: "R2_PRICE_FORMAT", message: "含税售价必须大于零。" });

      let business: RuleViolation[] = [];
      let split: AmountSplit | null = null;
      if (fen !== null && input.ratePercent !== null) {
        split = reverseSplit(fen, input.ratePercent);
        const duplicate = !!this.findDuplicate(input.station, input.fuel, input.effectiveDate, docId);
        business = validateBusiness(
          { duplicate },
          split,
          input.ratePercent
        ).violations;
      }
      const violations = [...fieldViolations, ...business];
      if (violations.length) {
        if (split) this.recordBlocked("submit", { ...input, split }, violations);
        return { ok: false, violations };
      }
      if (!split) {
        return {
          ok: false,
          violations: [{ rule: "R1_FIELDS", message: "金额或税率无法计算，请检查输入。" }]
        };
      }

      doc.station = input.station;
      doc.fuel = input.fuel;
      doc.effectiveDate = input.effectiveDate;
      const tax = checkTax(split, input.ratePercent as number);
      Object.assign(version, {
        ratePercent: input.ratePercent,
        grossFen: split.grossFen,
        netFen: split.netFen,
        taxFen: split.taxFen,
        independentTaxFen: split.independentTaxFen,
        diffFen: split.diffFen,
        taxAdjusted: false,
        abnormal: tax.abnormal,
        abnormalCodes: tax.issueCodes,
        operator: input.operator.trim() || version.operator,
        status: "pending" as VersionStatus,
        submittedAt: new Date().toISOString()
      });
      this.persist();
      return { ok: true, violations: [] };
    },

    /** 财务保存异常处理依据（待复核单） */
    saveBasis(docId: string, basis: string): ActionResult {
      const doc = this.documents.find((d) => d.id === docId);
      if (!doc) return { ok: false, violations: [] };
      const version = currentVersion(doc);
      const split = splitOf(version);
      const violations: RuleViolation[] = [];
      const tax = checkTax(split, version.ratePercent);
      if (!tax.abnormal) {
        // 正常单无需依据，允许直接关闭
      }
      if (tax.abnormal && !basis.trim()) {
        violations.push({ rule: "R6_ABNORMAL_BASIS", message: "税额异常须财务填写处理依据。" });
      }
      if (version.status !== "pending") {
        violations.push({ rule: "R8_FROZEN", message: "仅待复核单据可补写依据；已冻结版本不可修改。" });
      }
      if (violations.length) {
        this.recordBlocked(
          "saveBasis",
          { station: doc.station, fuel: doc.fuel, effectiveDate: doc.effectiveDate, split },
          violations
        );
        return { ok: false, violations };
      }
      version.basis = basis.trim();
      this.persist();
      return { ok: true, violations: [] };
    },

    /** 财务在一分容忍范围内调整税额（分），超过一分禁止 */
    adjustTax(docId: string, adjustedTaxFen: number): ActionResult {
      const doc = this.documents.find((d) => d.id === docId);
      if (!doc) return { ok: false, violations: [] };
      const version = currentVersion(doc);
      if (version.status !== "pending") {
        return {
          ok: false,
          violations: [{ rule: "R8_FROZEN", message: "仅待复核单据可调整税额。" }]
        };
      }
      const candidate = applyTaxAdjustment(reverseSplit(version.grossFen, version.ratePercent), adjustedTaxFen);
      if (Math.abs(candidate.diffFen) > 1 || !candidate.balanced) {
        const violations: RuleViolation[] = [
          { rule: "R5_BALANCE", message: `调整后倒推税额与正算税额相差 ${candidate.diffFen} 分，超过一分不得发布。` }
        ];
        this.recordBlocked(
          "approve",
          { station: doc.station, fuel: doc.fuel, effectiveDate: doc.effectiveDate, split: candidate },
          violations
        );
        return { ok: false, violations };
      }
      const tax = checkTax(candidate, version.ratePercent);
      version.taxFen = candidate.taxFen;
      version.netFen = candidate.netFen;
      version.diffFen = candidate.diffFen;
      version.taxAdjusted = candidate.taxFen !== candidate.independentTaxFen;
      version.abnormal = tax.abnormal;
      version.abnormalCodes = tax.issueCodes;
      this.persist();
      return { ok: true, violations: [] };
    },

    /** 财务复核通过：冻结税率、金额、依据 */
    approve(docId: string, reviewer: string, reviewNote: string): ActionResult {
      const doc = this.documents.find((d) => d.id === docId);
      if (!doc) return { ok: false, violations: [] };
      const version = currentVersion(doc);
      const split = splitOf(version);
      const violations = validateApproval(split, version.ratePercent, version.basis, reviewer);
      if (version.status !== "pending") {
        violations.push({ rule: "R8_FROZEN", message: "仅待复核单据可执行复核。" });
      }
      if (violations.length) {
        this.recordBlocked(
          "approve",
          { station: doc.station, fuel: doc.fuel, effectiveDate: doc.effectiveDate, split },
          violations
        );
        return { ok: false, violations };
      }
      version.status = "approved";
      version.reviewer = reviewer.trim();
      version.reviewNote = reviewNote.trim();
      version.reviewedAt = new Date().toISOString();
      // 冻结：后续任何修改只能走 correct()，UI 也会禁用输入
      this.persist();
      return { ok: true, violations: [] };
    },

    /** 复核驳回 */
    reject(docId: string, reviewer: string, reviewNote: string): ActionResult {
      const doc = this.documents.find((d) => d.id === docId);
      if (!doc) return { ok: false, violations: [] };
      const version = currentVersion(doc);
      if (version.status !== "pending") {
        return {
          ok: false,
          violations: [{ rule: "R8_FROZEN", message: "仅待复核单据可驳回。" }]
        };
      }
      version.status = "rejected";
      version.reviewer = reviewer.trim();
      version.reviewNote = reviewNote.trim() || "复核未通过";
      version.reviewedAt = new Date().toISOString();
      this.persist();
      return { ok: true, violations: [] };
    },

    /**
     * 更正已发布单：旧版本整体留旧值并标记"已更正"，另立新版本（草稿/待复核）。
     * 新版本沿用站点/油品/生效日，键仍唯一（旧版本不再参与唯一性约束）。
     */
    correct(docId: string, input: DraftInput): ActionResult {
      const doc = this.documents.find((d) => d.id === docId);
      if (!doc) return { ok: false, violations: [] };
      const oldVersion = currentVersion(doc);
      if (oldVersion.status !== "approved") {
        return {
          ok: false,
          violations: [{ rule: "R8_FROZEN", message: "仅已发布单据允许更正；更正会另立版本并保留旧值。" }]
        };
      }
      const fieldViolations = validateFields(input);
      const fen = yuanToFen(input.priceText);
      if (fen !== null && fen <= 0) fieldViolations.push({ rule: "R2_PRICE_FORMAT", message: "含税售价必须大于零。" });
      let business: RuleViolation[] = [];
      let split: AmountSplit | null = null;
      if (fen !== null && input.ratePercent !== null) {
        split = reverseSplit(fen, input.ratePercent);
        // 同键单据是自身，唯一性天然通过；校验其他键冲突
        const other = this.documents.find(
          (other) =>
            other.id !== doc.id &&
            other.station === input.station &&
            other.fuel === input.fuel &&
            other.effectiveDate === input.effectiveDate &&
            isActive(currentVersion(other))
        );
        if (other) business.push({ rule: "R4_UNIQUE", message: "目标站点/油品/生效日已存在其他有效单据。" });
        const b = validateBusiness({ duplicate: false }, split, input.ratePercent);
        business = [...business, ...b.violations];
      }
      const violations = [...fieldViolations, ...business];
      if (violations.length) {
        if (split) this.recordBlocked("submit", { ...input, split }, violations);
        return { ok: false, violations };
      }
      if (!split) {
        return {
          ok: false,
          violations: [{ rule: "R1_FIELDS", message: "金额或税率无法计算，请检查输入。" }]
        };
      }
      // 旧版本冻结留档
      oldVersion.status = "superseded";
      // 新版本
      const now = new Date().toISOString();
      const newVersion = this.buildVersion(input, split, oldVersion.versionNo + 1, "pending", now);
      doc.station = input.station;
      doc.fuel = input.fuel;
      doc.effectiveDate = input.effectiveDate;
      doc.versions.push(newVersion);
      this.persist();
      return { ok: true, violations: [] };
    },

    /** 仅允许删除草稿/驳回单的当前未发布版本；无版本则移除单据 */
    discard(docId: string) {
      const doc = this.documents.find((d) => d.id === docId);
      if (!doc) return;
      const version = currentVersion(doc);
      if (version.status === "approved" || version.status === "pending") return;
      if (doc.versions.length > 1) {
        // 回退到上一版本（更正链中驳回新版本，恢复旧发布版本）
        const removed = doc.versions.pop()!;
        const prev = currentVersion(doc);
        if (removed.status === "rejected" && prev.status === "superseded") {
          prev.status = "approved";
        }
      } else {
        this.documents = this.documents.filter((d) => d.id !== docId);
      }
      this.persist();
    },

    resetAll() {
      this.documents = resetDocuments();
      this.clearBlocked();
    }
  }
});
