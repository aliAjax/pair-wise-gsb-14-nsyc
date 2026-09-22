// 领域常量：基础档案与税务参数（规则层，不依赖存储与界面）

export const STATIONS = ["城东加油站", "城西加油站", "临港加油站", "高新园加油站"] as const;

export const FUELS = ["92号汽油", "95号汽油", "98号汽油", "0号柴油", "-10号柴油"] as const;

/** 可选税率（百分比），13% 为成品油增值税常用税率 */
export const TAX_RATES = [13, 9, 6, 3] as const;

/** 成品油标准税率（不在此列的税率视为异常，需财务写依据） */
export const STANDARD_TAX_RATES = [13] as const;

/** 差额容忍阈值（分）：含税价 − 不含税价 − 税额 的允许误差 */
export const TOLERANCE_FEN = 1;

export type Station = (typeof STATIONS)[number];
export type Fuel = (typeof FUELS)[number];
