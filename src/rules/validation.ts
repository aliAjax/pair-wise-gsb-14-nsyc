// 调价单发布/复核规则表与业务校验（规则层，纯函数，无 Vue/存储依赖）

import { AmountSplit, TaxCheckResult, checkTax } from "./tax";
import { FUELS, STATIONS, TAX_RATES } from "./constants";

export type VersionStatus = "draft" | "pending" | "approved" | "rejected" | "superseded";

export const STATUS_TEXT: Record<VersionStatus, string> = {
  draft: "草稿",
  pending: "待复核",
  approved: "已发布",
  rejected: "已驳回",
  superseded: "已更正"
};

/** 规则编码：受阻提示统一引用，保证"受阻显示站点、油品、差额与规则" */
export type RuleCode =
  | "R1_FIELDS"
  | "R2_PRICE_FORMAT"
  | "R3_RATE"
  | "R4_UNIQUE"
  | "R5_BALANCE"
  | "R6_ABNORMAL_BASIS"
  | "R7_REVIEW"
  | "R8_FROZEN";

export const RULE_TABLE: Record<RuleCode, { name: string; detail: string }> = {
  R1_FIELDS: {
    name: "必填项完整",
    detail: "调价单必须填写站点、油品、含税售价、税率和生效日。"
  },
  R2_PRICE_FORMAT: {
    name: "售价按分计价",
    detail: "含税售价必须为正数且最多两位小数（按分维护）。"
  },
  R3_RATE: {
    name: "税率合法",
    detail: `税率必须取自允许列表：${[...TAX_RATES].map((r) => `${r}%`).join("、")}。`
  },
  R4_UNIQUE: {
    name: "同站同油品同生效日唯一",
    detail: "同一站点、同一油品、同一生效日只允许一条调价单；更正必须另立版本，旧版本留档。"
  },
  R5_BALANCE: {
    name: "按分三项金额相等",
    detail: "按分后 含税价 − 不含税价 − 税额 必须为 0；倒推税额与正算税额差额超过一分不得发布。"
  },
  R6_ABNORMAL_BASIS: {
    name: "异常须财务依据",
    detail: "税额相差一分或税率非标准时，必须由财务填写处理依据，未写依据不得复核。"
  },
  R7_REVIEW: {
    name: "财务复核留痕",
    detail: "异常单据经财务复核通过后方可发布，须记录复核人与复核意见。"
  },
  R8_FROZEN: {
    name: "发布即冻结",
    detail: "复核通过后冻结税率、金额和依据；任何更正另立新版本，旧值保留可查。"
  }
};

/** 待发布调价单的草稿输入（金额拆分为规则层实时倒推结果） */
export interface DraftInput {
  station: string;
  fuel: string;
  priceText: string;
  ratePercent: number | null;
  effectiveDate: string;
  operator: string;
}

export interface ValidationContext {
  /** 同站同油品同生效日是否已存在有效版本（草稿/待复核/已发布/已驳回） */
  duplicate: boolean;
}

export interface RuleViolation {
  rule: RuleCode;
  message: string;
}

/** 基础字段校验（不依赖存储） */
export function validateFields(input: DraftInput): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!input.station || !input.fuel || !input.priceText.trim() || input.ratePercent === null || !input.effectiveDate) {
    violations.push({ rule: "R1_FIELDS", message: RULE_TABLE.R1_FIELDS.detail });
  }
  if (input.station && !(STATIONS as readonly string[]).includes(input.station)) {
    violations.push({ rule: "R1_FIELDS", message: "站点不在基础档案中。" });
  }
  if (input.fuel && !(FUELS as readonly string[]).includes(input.fuel)) {
    violations.push({ rule: "R1_FIELDS", message: "油品不在基础档案中。" });
  }
  if (input.ratePercent !== null && !(TAX_RATES as readonly number[]).includes(input.ratePercent)) {
    violations.push({ rule: "R3_RATE", message: RULE_TABLE.R3_RATE.detail });
  }

  return violations;
}

/** 业务校验：唯一性 + 税务金额（R6 依据只在复核环节强制，提交时允许进入待复核） */
export function validateBusiness(
  ctx: ValidationContext,
  split: AmountSplit,
  ratePercent: number
): { violations: RuleViolation[]; tax: TaxCheckResult } {
  const violations: RuleViolation[] = [];
  const tax = checkTax(split, ratePercent);

  if (ctx.duplicate) violations.push({ rule: "R4_UNIQUE", message: RULE_TABLE.R4_UNIQUE.detail });
  if (tax.issueCodes.includes("DIFF_OVER")) {
    violations.push({ rule: "R5_BALANCE", message: RULE_TABLE.R5_BALANCE.detail });
  }

  return { violations, tax };
}

/** 复核动作校验：必须无拦截项；异常单必须有依据与复核人 */
export function validateApproval(
  split: AmountSplit,
  ratePercent: number,
  basis: string,
  reviewer: string
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const tax = checkTax(split, ratePercent);

  if (!tax.publishable) violations.push({ rule: "R5_BALANCE", message: RULE_TABLE.R5_BALANCE.detail });
  if (tax.abnormal && !basis.trim()) {
    violations.push({ rule: "R6_ABNORMAL_BASIS", message: RULE_TABLE.R6_ABNORMAL_BASIS.detail });
  }
  if (tax.abnormal && !reviewer.trim()) {
    violations.push({ rule: "R7_REVIEW", message: RULE_TABLE.R7_REVIEW.detail });
  }
  return violations;
}
