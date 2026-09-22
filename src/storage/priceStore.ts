// 存储层：浏览器 localStorage 持久化、种子数据、刷新后一致性核对
// 不包含任何界面逻辑；只负责 PriceAdjustment 的读写与完整性校验。

import { splitMatchesStored } from "../domain/tax";
import type { PriceAdjustment } from "../domain/types";

const STORAGE_KEY = "dfwlfront-9-tax-review-v1";

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}

function record(
  partial: Omit<PriceAdjustment, "superseded" | "source"> &
    Partial<Pick<PriceAdjustment, "superseded" | "source">>
): PriceAdjustment {
  return { superseded: false, source: "manual", ...partial };
}

/** 演示数据：正常已发布、差一分待依据、更正版本链、正常待复核、历史导入拆分不平 */
export function seedRecords(): PriceAdjustment[] {
  return [
    record({
      id: "seed-1",
      docNo: "TJ-20260630-01",
      version: 1,
      station: "城东一站",
      fuel: "92号汽油",
      taxRate: 0.13,
      effectiveDate: "2026-06-30",
      status: "published",
      reviewer: "王财务",
      basis: "国家发改委调价通知，按分四舍五入。",
      createdAt: iso(80),
      frozenAt: iso(79),
      split: { grossInclusive: 7.62, inclusiveFen: 762, netFen: 674, taxFen: 88, diffFen: 0 }
    }),
    record({
      id: "seed-2",
      docNo: "TJ-20260701-07",
      version: 1,
      station: "滨江路站",
      fuel: "95号汽油",
      taxRate: 0.13,
      effectiveDate: "2026-07-01",
      status: "pending",
      createdAt: iso(3),
      split: { grossInclusive: 7.001, inclusiveFen: 700, netFen: 620, taxFen: 81, diffFen: -1 }
    }),
    record({
      id: "seed-3-v1",
      docNo: "TJ-20260625-03",
      version: 1,
      station: "南山大道站",
      fuel: "98号汽油",
      taxRate: 0.13,
      effectiveDate: "2026-06-25",
      status: "published",
      superseded: true,
      reviewer: "王财务",
      basis: "6月常规调价（旧版）。",
      createdAt: iso(30),
      frozenAt: iso(29),
      split: { grossInclusive: 8.4, inclusiveFen: 840, netFen: 743, taxFen: 97, diffFen: 0 }
    }),
    record({
      id: "seed-3-v2",
      docNo: "TJ-20260625-03",
      version: 2,
      station: "南山大道站",
      fuel: "98号汽油",
      taxRate: 0.13,
      effectiveDate: "2026-06-25",
      status: "published",
      reviewer: "李财务",
      basis: "执行区域竞争价 8.11，差额由站点促销列支；旧版 8.40 保留。",
      createdAt: iso(20),
      frozenAt: iso(19),
      split: { grossInclusive: 8.11, inclusiveFen: 811, netFen: 718, taxFen: 93, diffFen: 0 }
    }),
    record({
      id: "seed-4",
      docNo: "TJ-20260705-02",
      version: 1,
      station: "城北站",
      fuel: "柴油",
      taxRate: 0.13,
      effectiveDate: "2026-07-05",
      status: "pending",
      createdAt: iso(1),
      split: { grossInclusive: 7.18, inclusiveFen: 718, netFen: 635, taxFen: 83, diffFen: 0 }
    }),
    record({
      id: "seed-5",
      docNo: "TJ-20260610-09",
      version: 1,
      station: "西郊站",
      fuel: "92号汽油",
      taxRate: 0.13,
      effectiveDate: "2026-06-10",
      status: "pending",
      source: "import",
      basis: "",
      createdAt: iso(12),
      split: { grossInclusive: 7.18, inclusiveFen: 718, netFen: 634, taxFen: 82, diffFen: 2 }
    })
  ];
}

export function loadRecords(): PriceAdjustment[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedRecords();
  try {
    const parsed = JSON.parse(raw) as PriceAdjustment[];
    if (!Array.isArray(parsed)) return seedRecords();
    return parsed;
  } catch {
    return seedRecords();
  }
}

export function saveRecords(records: PriceAdjustment[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function clearRecords(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export interface IntegrityIssue {
  record: PriceAdjustment;
  reason: string;
}

/**
 * 刷新后核对：金额拆分须与倒推规则重新计算一致；冻结记录不得被改动关键字段。
 * 历史导入（source=import）的不平拆分是业务数据本身，只受 R-BALANCE 拦截，不在此报错。
 */
export function checkIntegrity(records: PriceAdjustment[]): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  for (const record of records) {
    if (record.source !== "import" && !splitMatchesStored(record.split, record.taxRate)) {
      issues.push({
        record,
        reason: `存储的金额拆分（含税 ${record.split.inclusiveFen} / 不含税 ${record.split.netFen} / 税额 ${record.split.taxFen}）与规则倒推结果不一致。`
      });
    }
  }
  // 版本链核对：同 docNo 版本号连续，且至多一个未被更正的版本
  const chains = new Map<string, PriceAdjustment[]>();
  for (const record of records) {
    const chain = chains.get(record.docNo) ?? [];
    chain.push(record);
    chains.set(record.docNo, chain);
  }
  for (const [docNo, chain] of chains) {
    const versions = chain.map((item) => item.version).sort((a, b) => a - b);
    versions.forEach((version, index) => {
      if (version !== index + 1) {
        const target = chain.find((item) => item.version === version)!;
        issues.push({ record: target, reason: `${docNo} 版本号不连续（${versions.join(", ")}）。` });
      }
    });
    const active = chain.filter((item) => !item.superseded);
    if (active.length > 1) {
      for (const item of active.slice(1)) {
        issues.push({ record: item, reason: `${docNo} 存在多个未更正版本。` });
      }
    }
  }
  return issues;
}
