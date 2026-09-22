// 状态编排层（Pinia）：连接规则层与存储层，对外提供单一操作入口
// 界面只调用这里的 action；规则判定仍在 domain，持久化仍在 storage。

import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import { checkIntegrity, loadRecords, saveRecords } from "../storage/priceStore";
import { businessKey, evaluateDraft, evaluatePublish } from "../domain/rules";
import type {
  AdjustmentDraft,
  PriceAdjustment,
  RuleViolation
} from "../domain/types";
import type { IntegrityIssue } from "../storage/priceStore";

export type ActionResult = { ok: true } | { ok: false; violations: RuleViolation[] };

function blankDraft(): AdjustmentDraft {
  return { station: "", fuel: "", taxRate: 0.13, effectiveDate: "", grossInclusive: "" };
}

export const usePriceStore = defineStore("tax-review", () => {
  const records = ref<PriceAdjustment[]>(loadRecords());
  const draft = reactive<AdjustmentDraft>(blankDraft());
  const correctingDocNo = ref<string | null>(null);
  const integrityIssues = ref<IntegrityIssue[]>(checkIntegrity(records.value));

  /** 当前有效记录（未被更正的最新版本），唯一键校验与列表基于它 */
  const latest = computed(() => records.value.filter((record) => !record.superseded));

  const pending = computed(() =>
    latest.value
      .filter((record) => record.status === "pending")
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  );
  const published = computed(() =>
    latest.value
      .filter((record) => record.status === "published")
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
  );
  const superseded = computed(() =>
    records.value.filter((record) => record.superseded)
  );

  const metrics = computed(() => ({
    total: records.value.length,
    pendingNormal: pending.value.filter((record) => record.split.diffFen === 0).length,
    pendingAbnormal: pending.value.filter((record) => Math.abs(record.split.diffFen) === 1).length,
    blocked: pending.value.filter((record) => Math.abs(record.split.diffFen) > 1).length,
    published: published.value.length,
    versions: new Set(records.value.map((record) => record.docNo)).size
  }));

  function persist(): void {
    saveRecords(records.value);
    integrityIssues.value = checkIntegrity(records.value);
  }

  function resetDraft(): void {
    Object.assign(draft, blankDraft());
    correctingDocNo.value = null;
  }

  /** 以已发布单据预填草稿，发起更正：站点/油品/生效日只读，新版本沿用 docNo */
  function startCorrection(record: PriceAdjustment): void {
    correctingDocNo.value = record.docNo;
    draft.station = record.station;
    draft.fuel = record.fuel;
    draft.taxRate = record.taxRate;
    draft.effectiveDate = record.effectiveDate;
    draft.grossInclusive = String(record.split.grossInclusive);
  }

  /** 表单实时校验（用于预览拆分与受阻提示，不落库） */
  function preview(): { violations: RuleViolation[]; split: PriceAdjustment["split"] | null } {
    const result = evaluateDraft(draft, {
      latest: latest.value,
      excludeDocNo: correctingDocNo.value ?? undefined
    });
    return result;
  }

  function nextDocNo(): string {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `TJ-${day}-`;
    const max = records.value.reduce((acc, record) => {
      if (!record.docNo.startsWith(prefix)) return acc;
      const seq = Number(record.docNo.slice(prefix.length));
      return Number.isFinite(seq) ? Math.max(acc, seq) : acc;
    }, 0);
    return `${prefix}${String(max + 1).padStart(2, "0")}`;
  }

  /** 提交调价单：硬规则违反（要素缺失 / 超一分 / 重复）直接受阻，不产生记录 */
  function submitDraft(): ActionResult {
    const evaluation = evaluateDraft(draft, {
      latest: latest.value,
      excludeDocNo: correctingDocNo.value ?? undefined
    });
    const blocks = evaluation.violations.filter((item) => item.severity === "block");
    if (blocks.length > 0 || !evaluation.split) {
      return { ok: false, violations: blocks };
    }

    const now = new Date().toISOString();
    if (correctingDocNo.value) {
      const docNo = correctingDocNo.value;
      const chain = records.value.filter((record) => record.docNo === docNo);
      const nextVersion = Math.max(...chain.map((record) => record.version)) + 1;
      for (const record of records.value) {
        if (record.docNo === docNo && !record.superseded) record.superseded = true;
      }
      records.value.unshift({
        id: crypto.randomUUID(),
        docNo,
        version: nextVersion,
        station: draft.station,
        fuel: draft.fuel,
        taxRate: Number(draft.taxRate),
        effectiveDate: draft.effectiveDate,
        split: evaluation.split,
        status: "pending",
        superseded: false,
        source: "manual",
        basis: "",
        createdAt: now
      });
    } else {
      records.value.unshift({
        id: crypto.randomUUID(),
        docNo: nextDocNo(),
        version: 1,
        station: draft.station,
        fuel: draft.fuel,
        taxRate: Number(draft.taxRate),
        effectiveDate: draft.effectiveDate,
        split: evaluation.split,
        status: "pending",
        superseded: false,
        source: "manual",
        basis: "",
        createdAt: now
      });
    }

    persist();
    resetDraft();
    return { ok: true };
  }

  /** 保存财务填写的计税依据（草稿，仅待复核单据） */
  function saveBasis(id: string, basis: string): void {
    const record = records.value.find((item) => item.id === id);
    if (record && record.status === "pending") {
      record.basis = basis.trim();
      persist();
    }
  }

  /** 财务复核发布：依据 / 复核人校验通过后冻结税率、金额与依据 */
  function approve(id: string, basis: string, reviewer: string): ActionResult {
    const record = records.value.find((item) => item.id === id);
    if (!record || record.status !== "pending") {
      return {
        ok: false,
        violations: [
          {
            ruleCode: "R-FROZEN",
            ruleName: "发布即冻结",
            message: "仅待复核单据可以发布。",
            station: record?.station ?? "—",
            fuel: record?.fuel ?? "—",
            diffFen: record?.split.diffFen ?? 0,
            severity: "block"
          }
        ]
      };
    }
    const violations = evaluatePublish(record, basis, reviewer);
    if (violations.length > 0) return { ok: false, violations };

    record.basis = basis.trim();
    record.reviewer = reviewer.trim();
    record.status = "published";
    record.frozenAt = new Date().toISOString();
    persist();
    return { ok: true };
  }

  /**
   * 放弃待复核单据（含受阻的历史导入）。
   * 若放弃的是更正产生的新版本，则旧版本恢复为有效，保证同键始终有一条生效记录。
   */
  function discardPending(id: string): void {
    const target = records.value.find((record) => record.id === id);
    if (!target || target.status !== "pending") return;
    records.value = records.value.filter((record) => record.id !== id);
    if (target.version > 1) {
      const chain = records.value
        .filter((record) => record.docNo === target.docNo)
        .sort((a, b) => b.version - a.version);
      const previous = chain[0];
      if (previous) previous.superseded = false;
    }
    persist();
  }

  function versionsOf(docNo: string): PriceAdjustment[] {
    return records.value
      .filter((record) => record.docNo === docNo)
      .sort((a, b) => b.version - a.version);
  }

  function keyOf(record: PriceAdjustment): string {
    return businessKey(record.station, record.fuel, record.effectiveDate);
  }

  return {
    records,
    draft,
    correctingDocNo,
    integrityIssues,
    latest,
    pending,
    published,
    superseded,
    metrics,
    preview,
    submitDraft,
    startCorrection,
    resetDraft,
    saveBasis,
    approve,
    discardPending,
    versionsOf,
    keyOf
  };
});
