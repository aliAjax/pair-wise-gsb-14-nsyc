// 存储层数据模型：仅描述持久化结构，不包含任何规则计算

import type { VersionStatus } from "../rules/validation";

/** 一个版本：金额与税率在发布后冻结 */
export interface PriceVersion {
  id: string;
  /** 版本号，从 1 起，更正另立版本 */
  versionNo: number;
  status: VersionStatus;
  /** 税率（百分比），发布后冻结 */
  ratePercent: number;
  /** 含税售价（分，冻结） */
  grossFen: number;
  /** 不含税价（分，倒推，冻结） */
  netFen: number;
  /** 税额（分，倒推，冻结） */
  taxFen: number;
  /** 正算交叉校验税额（分） */
  independentTaxFen: number;
  /** 差额（分）= 倒推税额 − 正算税额 */
  diffFen: number;
  /** 是否存在一分以内的税额调整 */
  taxAdjusted: boolean;
  /** 异常标记（一分差/非标准税率），发布后冻结 */
  abnormal: boolean;
  abnormalCodes: string[];
  /** 财务处理依据（异常时必填，发布后冻结） */
  basis: string;
  operator: string;
  /** 财务复核人 */
  reviewer: string;
  reviewNote: string;
  createdAt: string;
  submittedAt: string;
  reviewedAt: string;
}

/** 调价单：同站同油品同生效日只有一个单据，单据下挂版本链 */
export interface PriceDocument {
  id: string;
  station: string;
  fuel: string;
  effectiveDate: string;
  versions: PriceVersion[];
}

/** 受阻记录：发布/复核被规则拦截时留下，用于"受阻显示站点、油品、差额与规则" */
export interface BlockedAttempt {
  id: string;
  at: string;
  station: string;
  fuel: string;
  effectiveDate: string;
  grossFen: number;
  netFen: number;
  taxFen: number;
  diffFen: number;
  action: "submit" | "approve" | "saveBasis";
  ruleCodes: string[];
  messages: string[];
}

export interface PersistShape {
  version: 1;
  documents: PriceDocument[];
}

/** 当前版本快捷访问 */
export function currentVersion(doc: PriceDocument): PriceVersion {
  return doc.versions[doc.versions.length - 1];
}

/** 有效版本：未被更正替代的版本（参与唯一性约束） */
export function isActive(version: PriceVersion): boolean {
  return version.status !== "superseded";
}
