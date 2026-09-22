// 规则层：含税倒推
// 含税售价倒推不含税价与税额；按分后三项金额必须勾稽。

import { roundYuanToFen } from "./money";
import type { AmountSplit } from "./types";

/** 允许的最大勾稽差额：1 分 */
export const MAX_TOLERANCE_FEN = 1;

/** 差额分级：相等 / 差一分（须财务依据并复核）/ 超一分（不得发布） */
export type BalanceLevel = "balanced" | "abnormal" | "blocked";

/** 倒推：含税价 / (1 + 税率) → 不含税价；税额 = 含税价 − 不含税价（倒推口径） */
export function reverseSplit(grossInclusiveYuan: number, taxRate: number): AmountSplit {
  const exactNetYuan = grossInclusiveYuan / (1 + taxRate);
  const exactTaxYuan = grossInclusiveYuan - exactNetYuan;

  const inclusiveFen = roundYuanToFen(grossInclusiveYuan);
  const netFen = roundYuanToFen(exactNetYuan);
  const taxFen = roundYuanToFen(exactTaxYuan);
  const diffFen = inclusiveFen - netFen - taxFen;

  return {
    grossInclusive: grossInclusiveYuan,
    inclusiveFen,
    netFen,
    taxFen,
    diffFen
  };
}

export function balanceLevel(diffFen: number): BalanceLevel {
  const abs = Math.abs(diffFen);
  if (abs === 0) return "balanced";
  if (abs <= MAX_TOLERANCE_FEN) return "abnormal";
  return "blocked";
}

/** 用已存拆分复核（刷新后核对金额拆分是否与倒推结果一致） */
export function splitMatchesStored(split: AmountSplit, taxRate: number): boolean {
  const fresh = reverseSplit(split.grossInclusive, taxRate);
  return (
    fresh.inclusiveFen === split.inclusiveFen &&
    fresh.netFen === split.netFen &&
    fresh.taxFen === split.taxFen &&
    fresh.diffFen === split.diffFen
  );
}
