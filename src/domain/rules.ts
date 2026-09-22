// 规则层：调价规则定义与草稿校验
// 纯函数：只做判定，不读写存储、不触发界面。

import { parseYuan } from "./money";
import { balanceLevel, reverseSplit } from "./tax";
import { FUELS, STATIONS, TAX_RATES } from "./types";
import type {
  AdjustmentDraft,
  DraftEvaluation,
  PriceAdjustment,
  RuleViolation
} from "./types";

/** 规则台账：展示与校验共用同一份定义 */
export const RULES = [
  {
    code: "R-REQUIRED",
    name: "要素完整",
    description: "调价单必须填写站点、油品、含税售价、税率和生效日，含税售价须为大于 0 的金额。"
  },
  {
    code: "R-BALANCE",
    name: "按分勾稽",
    description:
      "倒推不含税价与税额后按分四舍五入，含税价 = 不含税价 + 税额必须相等；差额超过一分不得发布，差一分按税额异常处理。"
  },
  {
    code: "R-UNIQUE",
    name: "同日唯一",
    description: "同站同油品同生效日只能存在一条有效调价单（更正沿用同一单据升版本，不另占唯一键）。"
  },
  {
    code: "R-BASIS",
    name: "异常须依据",
    description: "税额存在一分差异时，必须由财务填写计税依据并复核，无依据不得发布。"
  },
  {
    code: "R-FROZEN",
    name: "发布即冻结",
    description: "复核通过后冻结税率、金额和计税依据；更正只能另立新版本，旧值原样保留。"
  }
] as const;

export function businessKey(station: string, fuel: string, effectiveDate: string): string {
  return `${station}|${fuel}|${effectiveDate}`;
}

function violation(
  ruleCode: string,
  message: string,
  station: string,
  fuel: string,
  diffFen: number,
  severity: RuleViolation["severity"]
): RuleViolation {
  const rule = RULES.find((item) => item.code === ruleCode)!;
  return {
    ruleCode,
    ruleName: rule.name,
    message,
    station: station || "—",
    fuel: fuel || "—",
    diffFen,
    severity
  };
}

export interface EvaluateContext {
  /** 当前各业务键上的最新有效（未被更正）记录 */
  latest: PriceAdjustment[];
  /** 更正时传入原单据编号，同 docNo 版本链不视为重复 */
  excludeDocNo?: string;
}

/** 校验草稿：返回规则违反项与倒推拆分（输入不足以倒推时 split 为 null） */
export function evaluateDraft(draft: AdjustmentDraft, context: EvaluateContext): DraftEvaluation {
  const violations: RuleViolation[] = [];
  const station = draft.station;
  const fuel = draft.fuel;
  const date = draft.effectiveDate;

  const missing: string[] = [];
  if (!station) missing.push("站点");
  if (!fuel) missing.push("油品");
  if (!date) missing.push("生效日");
  if (draft.taxRate === "") missing.push("税率");
  const gross = parseYuan(draft.grossInclusive);
  if (gross === null || gross <= 0) missing.push("含税售价（须大于 0）");
  if (missing.length > 0) {
    violations.push(
      violation("R-REQUIRED", `缺少或非法的必填项：${missing.join("、")}`, station, fuel, 0, "block")
    );
  }

  let split = null;
  if (gross !== null && gross > 0 && draft.taxRate !== "") {
    split = reverseSplit(gross, draft.taxRate);
    const level = balanceLevel(split.diffFen);
    if (level === "blocked") {
      violations.push(
        violation(
          "R-BALANCE",
          `按分后含税价 − 不含税价 − 税额 = ${split.diffFen} 分，差额超过一分，不得发布，请修正含税售价。`,
          station,
          fuel,
          split.diffFen,
          "block"
        )
      );
    } else if (level === "abnormal") {
      violations.push(
        violation(
          "R-BALANCE",
          `按分后存在 ${split.diffFen} 分差异（未超过一分，可提交复核），发布前须由财务填写计税依据。`,
          station,
          fuel,
          split.diffFen,
          "info"
        )
      );
    }
  }

  if (station && fuel && date) {
    const key = businessKey(station, fuel, date);
    const duplicated = context.latest.find(
      (record) =>
        !record.superseded &&
        businessKey(record.station, record.fuel, record.effectiveDate) === key &&
        record.docNo !== context.excludeDocNo
    );
    if (duplicated) {
      violations.push(
        violation(
          "R-UNIQUE",
          `${station} / ${fuel} / ${date} 已存在调价单 ${duplicated.docNo}（v${duplicated.version}），同站同油品同生效日只能一条。`,
          station,
          fuel,
          0,
          "block"
        )
      );
    }
  }

  return { violations, split };
}

/** 复核台发布前校验：异常必须有依据；复核人必填；超一分不得发布 */
export function evaluatePublish(
  record: PriceAdjustment,
  basis: string,
  reviewer: string
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const level = balanceLevel(record.split.diffFen);
  if (level === "blocked") {
    violations.push(
      violation(
        "R-BALANCE",
        `拆分差额 ${record.split.diffFen} 分超过一分，不得发布。`,
        record.station,
        record.fuel,
        record.split.diffFen,
        "block"
      )
    );
  }
  if (level === "abnormal" && basis.trim().length === 0) {
    violations.push(
      violation(
        "R-BASIS",
        "税额存在一分差异，必须由财务填写计税依据后方可复核发布。",
        record.station,
        record.fuel,
        record.split.diffFen,
        "block"
      )
    );
  }
  if (!reviewer.trim()) {
    violations.push(
      violation(
        "R-BASIS",
        "复核发布必须填写财务复核人。",
        record.station,
        record.fuel,
        record.split.diffFen,
        "block"
      )
    );
  }
  return violations;
}

export { FUELS, STATIONS, TAX_RATES };
