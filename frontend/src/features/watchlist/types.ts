export type WatchlistAssetType = "a_share" | "fund_etf";

export interface WatchlistFilters {
  keyword: string;
  asset_type: WatchlistAssetType | "";
}

export interface WatchlistItem {
  id: string;
  thscode: string;
  ticker: string;
  name: string;
  asset_type: WatchlistAssetType;
  exchange: string;
  industry: string | null;
  note: string | null;
  sort_order: number;
  added_at: string;
  created_at: string;
  updated_at: string;
  latest: number | null;
  change: number | null;
  change_percent: number | null;
  volume: number | null;
  turnover: number | null;
  total_market_cap: number | null;
  pe_ttm: number | null;
  pe_dynamic: number | null;
  pb: number | null;
  dividend_yield: number | null;
  concept: string | null;
  volume_ratio: number | null;
  turnover_rate: number | null;
  quoted_at: string | null;
}

export interface DataSourceSummary {
  state: "ready" | "not_configured" | "authentication_failed" | "rate_limited" | "unavailable";
  name: string | null;
  message: string | null;
}

export type MarketStatus = "交易中" | "午间休市" | "已收盘" | "休市" | "未知";

export interface WatchlistResponse {
  items: WatchlistItem[];
  data_source: DataSourceSummary;
  market_status: MarketStatus;
  polling_enabled: boolean;
  refresh_seconds: number;
  stale: boolean;
}

export interface WatchlistCreatePayload {
  thscode: string;
  note: string | null;
}

export interface WatchlistUpdatePayload {
  note: string | null;
}
