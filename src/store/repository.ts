// 存储层：localStorage / sessionStorage 读写封装，与界面和规则解耦

import { buildSeed } from "./seed";
import type { BlockedAttempt, PersistShape, PriceDocument } from "./types";

const STORAGE_KEY = "dfwlfront-9-tax-review-v1";
const BLOCKED_KEY = "dfwlfront-9-blocked-v1";

export function loadDocuments(): PriceDocument[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed && Array.isArray(parsed.documents)) return parsed.documents;
    } catch {
      // 数据损坏时回落到种子数据
    }
  }
  return buildSeed().documents;
}

export function saveDocuments(documents: PriceDocument[]): void {
  const payload: PersistShape = { version: 1, documents };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function resetDocuments(): PriceDocument[] {
  const seed = buildSeed().documents;
  saveDocuments(seed);
  return seed;
}

export function loadBlocked(): BlockedAttempt[] {
  const raw = sessionStorage.getItem(BLOCKED_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as BlockedAttempt[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBlocked(attempts: BlockedAttempt[]): void {
  sessionStorage.setItem(BLOCKED_KEY, JSON.stringify(attempts));
}
