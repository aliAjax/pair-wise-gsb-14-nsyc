// 领域模型：含税倒推与税务复核
// 仅描述业务概念，不依赖 Vue、Pinia 或 localStorage。

export const STATIONS = ["城东一站", "滨江路站", "南山大道站", "城北站", "西郊站"] as const;
export const FUELS = ["92号汽油", "95号汽油", "98号汽油", "柴油"] as const;
export const TAX_RATES = [0.13, 0.09, 0.06, 0.03] as const;

/** 单据状态：待财务复核 / 已发布（发布即冻结） */
export type ReviewStatus = "pending" | "published";

/** 来源：手工调价单 / 历史导入（导入数据可能存在拆分不平，只用于复核台拦截演示） */
export type RecordSource = "manual" | "import";

/** 金额拆分：三项金额一律以"分"整数存储，按分后必须勾稽 */
export interface AmountSplit {
  /** 输入的含税售价（元，允许高于两位小数，如 7.001） */
  grossInclusive: number;
  /** 含税售价（分） */
  inclusiveFen: number;
  /** 不含税价（分） */
  netFen: number;
  /** 税额（分） */
  taxFen: number;
  /** 差额（分）= 含税 - 不含税 - 税额；按分后应为 0 */
  diffFen: number;
}

/** 调价单（一个版本一条记录；同 docNo 的多条记录构成版本链） */
export interface PriceAdjustment {
  id: string;
  /** 同一次调价的业务编号，更正沿用同一 docNo 并递增 version */
  docNo: string;
  version: number;
  station: string;
  fuel: string;
  /** 税率，如 0.13；发布后冻结 */
  taxRate: number;
  effectiveDate: string;
  split: AmountSplit;
  status: ReviewStatus;
  /** 被新版本更正后置为 true，记录保留、不再参与唯一键校验 */
  superseded: boolean;
  source: RecordSource;
  /** 税额异常时财务填写的计税依据；发布后冻结 */
  basis?: string;
  /** 财务复核人；发布后冻结 */
  reviewer?: string;
  createdAt: string;
  /** 发布冻结时间 */
  frozenAt?: string;
}

/** 调价单草稿：表单输入 */
export interface AdjustmentDraft {
  station: string;
  fuel: string;
  taxRate: number | "";
  effectiveDate: string;
  /** 含税售价，字符串保留输入精度 */
  grossInclusive: string;
}

/** 规则违反项；受阻时必须能定位站点、油品、差额与规则 */
export interface RuleViolation {
  ruleCode: string;
  ruleName: string;
  message: string;
  station: string;
  fuel: string;
  /** 差额（分），与差额无关的规则为 0 */
  diffFen: number;
  severity: "block" | "info";
}

/** 草稿校验结果 */
export interface DraftEvaluation {
  violations: RuleViolation[];
  split: AmountSplit | null;
}
