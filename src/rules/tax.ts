// 税务计算规则（纯函数）：
// 以"分"为最小单位做整数运算，避免浮点误差；
// 不含税价、税额按分四舍五入；
// 税额采用"倒推法"（税额 = 含税价 − 不含税价），保证按分后三者恒等。
// 另用"正算法"独立计算税额作为交叉校验，二者之差用于发现税额异常。

import { STANDARD_TAX_RATES, TOLERANCE_FEN } from "./constants";

/** 金额拆分：含税价、不含税价、税额，全部以分存储 */
export interface AmountSplit {
  /** 含税售价（分） */
  grossFen: number;
  /** 不含税价（分，倒推法，按分四舍五入） */
  netFen: number;
  /** 税额（分，倒推法 = 含税价 − 不含税价，保证分后恒等） */
  taxFen: number;
  /** 正算交叉校验税额（分 = 含税价 × 税率 / (1 + 税率)，按分四舍五入） */
  independentTaxFen: number;
  /** 差额（分）= 倒推税额 − 正算税额，绝对值超过 1 分不得发布 */
  diffFen: number;
  /** 分后恒等校验：含税价 − 不含税价 − 税额 是否为 0 */
  balanced: boolean;
}

/** 元（字符串，最多两位小数）转分，非法值返回 null */
export function yuanToFen(yuanText: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(yuanText.trim())) return null;
  const [intPart, decPart = ""] = yuanText.trim().split(".");
  const fen = Number(intPart) * 100 + Number((decPart + "00").slice(0, 2));
  return Number.isSafeInteger(fen) ? fen : null;
}

/** 分转元（数值，两位小数） */
export function fenToYuan(fen: number): number {
  return Math.round(fen) / 100;
}

/** 分转展示文本，如 762 -> "7.62" */
export function formatFen(fen: number): string {
  const sign = fen < 0 ? "-" : "";
  const abs = Math.abs(Math.round(fen));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** 整数四舍五入（非负输入）：round(a / b) */
function roundedDiv(dividend: number, divisor: number): number {
  return Math.floor((dividend + divisor / 2) / divisor);
}

/**
 * 含税价倒推金额拆分
 * @param grossFen 含税售价（分）
 * @param ratePercent 税率（百分比，如 13 表示 13%）
 */
export function reverseSplit(grossFen: number, ratePercent: number): AmountSplit {
  const denominator = 10000 + ratePercent * 100; // (1 + r) × 10000
  const netFen = roundedDiv(grossFen * 10000, denominator);
  const taxFen = grossFen - netFen; // 倒推：保证分后恒等
  const independentTaxFen = roundedDiv(grossFen * ratePercent * 100, denominator);
  const diffFen = taxFen - independentTaxFen;
  return {
    grossFen,
    netFen,
    taxFen,
    independentTaxFen,
    diffFen,
    balanced: grossFen - netFen - taxFen === 0
  };
}

/** 应用财务税额调整（单位：分），重新校验恒等关系 */
export function applyTaxAdjustment(base: AmountSplit, adjustedTaxFen: number): AmountSplit {
  const taxFen = Math.round(adjustedTaxFen);
  const netFen = base.grossFen - taxFen;
  const diffFen = taxFen - base.independentTaxFen;
  return {
    ...base,
    netFen,
    taxFen,
    diffFen,
    balanced: base.grossFen - netFen - taxFen === 0
  };
}

/** 差额是否超过一分（超过即不得发布） */
export function diffExceedsTolerance(split: AmountSplit): boolean {
  return Math.abs(split.diffFen) > TOLERANCE_FEN || !split.balanced;
}

export type TaxIssueCode = "DIFF_OVER" | "DIFF_ONE" | "RATE_NONSTANDARD";

export interface TaxCheckResult {
  /** 是否异常：异常必须财务写依据并复核 */
  abnormal: boolean;
  issueCodes: TaxIssueCode[];
  /** 是否可发布（差额超过一分禁止发布） */
  publishable: boolean;
}

/**
 * 税务复核：
 * - 差额 > 1 分：不得发布（硬性拦截）
 * - 差额 = 1 分或税率非标准：异常，须财务写依据并复核后才能通过
 */
export function checkTax(split: AmountSplit, ratePercent: number): TaxCheckResult {
  const issueCodes: TaxIssueCode[] = [];
  if (diffExceedsTolerance(split)) issueCodes.push("DIFF_OVER");
  else if (Math.abs(split.diffFen) === TOLERANCE_FEN) issueCodes.push("DIFF_ONE");
  if (!(STANDARD_TAX_RATES as readonly number[]).includes(ratePercent)) {
    issueCodes.push("RATE_NONSTANDARD");
  }
  const blocked = issueCodes.includes("DIFF_OVER");
  return { abnormal: issueCodes.length > 0, issueCodes, publishable: !blocked };
}

export const TAX_ISSUE_TEXT: Record<TaxIssueCode, string> = {
  DIFF_OVER: "税额差额超过一分，不得发布",
  DIFF_ONE: "倒推税额与正算税额相差一分，须财务写依据并复核",
  RATE_NONSTANDARD: "非标准税率，须财务写依据并复核"
};
