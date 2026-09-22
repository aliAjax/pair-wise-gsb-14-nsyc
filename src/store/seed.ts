// 种子数据：经规则层 reverseSplit 倒推，保证金额拆分自洽

import { reverseSplit } from "../rules/tax";
import type { PersistShape, PriceDocument, PriceVersion } from "./types";

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function makeVersion(partial: Partial<PriceVersion> & {
  versionNo: number;
  status: PriceVersion["status"];
  ratePercent: number;
  grossFen: number;
  abnormal?: boolean;
  abnormalCodes?: string[];
  basis?: string;
  operator?: string;
  reviewer?: string;
  reviewNote?: string;
  taxAdjusted?: boolean;
  ageHours: number;
}): PriceVersion {
  const split = reverseSplit(partial.grossFen, partial.ratePercent);
  const created = new Date(Date.now() - partial.ageHours * 3600000).toISOString();
  return {
    id: uid("ver"),
    versionNo: partial.versionNo,
    status: partial.status,
    ratePercent: partial.ratePercent,
    grossFen: split.grossFen,
    netFen: split.netFen,
    taxFen: split.taxFen,
    independentTaxFen: split.independentTaxFen,
    diffFen: split.diffFen,
    taxAdjusted: partial.taxAdjusted ?? false,
    abnormal: partial.abnormal ?? false,
    abnormalCodes: partial.abnormalCodes ?? [],
    basis: partial.basis ?? "",
    operator: partial.operator ?? "",
    reviewer: partial.reviewer ?? "",
    reviewNote: partial.reviewNote ?? "",
    createdAt: created,
    submittedAt: partial.status === "draft" ? "" : created,
    reviewedAt: partial.status === "approved" || partial.status === "superseded" ? created : ""
  };
}

function seedDocuments(): PriceDocument[] {
  const now = Date.now();
  const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600000).toISOString();

  // 1. 已发布单（冻结态）
  const approved: PriceDocument = {
    id: uid("doc"),
    station: "城东加油站",
    fuel: "92号汽油",
    effectiveDate: "2026-09-25",
    versions: [
      makeVersion({
        versionNo: 1,
        status: "approved",
        ratePercent: 13,
        grossFen: 762,
        operator: "王站长",
        reviewer: "李财务",
        reviewNote: "按本期挂牌价执行，税额拆分核对无误。",
        ageHours: 50
      })
    ]
  };

  // 2. 异常待复核：非标准税率 9%，财务已写依据，等待复核
  const pendingSplit = reverseSplit(718, 9);
  const pending: PriceDocument = {
    id: uid("doc"),
    station: "城西加油站",
    fuel: "0号柴油",
    effectiveDate: "2026-09-25",
    versions: [
      {
        id: uid("ver"),
        versionNo: 1,
        status: "pending",
        ratePercent: 9,
        grossFen: pendingSplit.grossFen,
        netFen: pendingSplit.netFen,
        taxFen: pendingSplit.taxFen,
        independentTaxFen: pendingSplit.independentTaxFen,
        diffFen: pendingSplit.diffFen,
        taxAdjusted: false,
        abnormal: true,
        abnormalCodes: ["RATE_NONSTANDARD"],
        basis: "批发分销环节按 9% 计税，依据财税〔2026〕样例文号，已经分公司财务备案。",
        operator: "赵值班",
        reviewer: "",
        reviewNote: "",
        createdAt: iso(26),
        submittedAt: iso(24),
        reviewedAt: ""
      }
    ]
  };

  // 3. 草稿
  const draft: PriceDocument = {
    id: uid("doc"),
    station: "临港加油站",
    fuel: "95号汽油",
    effectiveDate: "2026-10-01",
    versions: [
      makeVersion({
        versionNo: 1,
        status: "draft",
        ratePercent: 13,
        grossFen: 799,
        operator: "孙主管",
        ageHours: 6
      })
    ]
  };

  // 4. 更正链：v1 已发布后更正，v1 留旧值标记"已更正"，v2 为当前发布版本
  const v1 = makeVersion({
    versionNo: 1,
    status: "superseded",
    ratePercent: 13,
    grossFen: 886,
    operator: "周经理",
    reviewer: "李财务",
    reviewNote: "初版挂牌价。",
    ageHours: 120
  });
  const v2 = makeVersion({
    versionNo: 2,
    status: "approved",
    ratePercent: 13,
    grossFen: 881,
    operator: "周经理",
    reviewer: "李财务",
    reviewNote: "接省公司通知下调 5 分，另立版本更正，旧版留档。",
    ageHours: 30
  });
  const corrected: PriceDocument = {
    id: uid("doc"),
    station: "高新园加油站",
    fuel: "98号汽油",
    effectiveDate: "2026-09-20",
    versions: [v1, v2]
  };

  return [approved, pending, draft, corrected];
}

export function buildSeed(): PersistShape {
  return { version: 1, documents: seedDocuments() };
}
