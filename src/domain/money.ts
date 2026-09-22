// 规则层：金额工具
// 所有计算以"分"整数进行，避免浮点误差；入参以元为单位。

/** 解析元为金额（不四舍五入），非法输入返回 null */
export function parseYuan(input: string): number | null {
  const value = Number(input);
  if (input.trim() === "" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * 元 → 分（四舍五入，半值进位，即"按分"口径）。
 * 用字符串解析规避 7.001 * 100 = 700.0999... 之类的浮点误差。
 */
export function roundYuanToFen(yuan: number): number {
  const sign = yuan < 0 ? -1 : 1;
  const text = Math.abs(yuan).toFixed(6);
  const [intPart, decPart = ""] = text.split(".");
  const cent = Number(decPart.slice(0, 2));
  const rest = Number(`0.${decPart.slice(2)}` || 0);
  return sign * (Number(intPart) * 100 + cent + (rest >= 0.5 ? 1 : 0));
}

/** 分（整数）→ 展示用元字符串，保留两位小数 */
export function fenToYuan(fen: number): string {
  const sign = fen < 0 ? "-" : "";
  const abs = Math.abs(fen);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** 差额（分）→ 展示，带正负号 */
export function formatDiff(fen: number): string {
  if (fen === 0) return "0.00";
  return fen > 0 ? `+${fenToYuan(fen)}` : fenToYuan(fen);
}

/** 元金额是否含有分以下精度（如 7.001）。用容差规避 7.62 * 100 = 761.9999… 误判 */
export function hasSubFenPrecision(yuan: number): boolean {
  return Math.abs(yuan * 100 - Math.round(yuan * 100)) > 1e-6;
}
