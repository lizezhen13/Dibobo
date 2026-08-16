export type AssetType = "a_share" | "fund_etf";

export type MarketStatus = "交易中" | "午间休市" | "已收盘" | "休市" | "未知";

export type DataSourceState = "ready" | "not_configured" | "authentication_failed" | "rate_limited" | "unavailable";

export interface DataSourceSummary {
  state: DataSourceState;
  name: string | null;
  message: string | null;
}
