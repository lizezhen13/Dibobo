export type HoldingStatus = "open" | "closed";
export type AssetType = "a_share" | "fund_etf";
export type MarketStatus = "交易中" | "午间休市" | "已收盘" | "休市" | "未知";

export interface DataSourceSummary {
  state: "ready" | "not_configured" | "authentication_failed" | "rate_limited" | "unavailable";
  name: string | null;
  message: string | null;
}

export interface Instrument {
  thscode: string;
  ticker: string;
  name: string;
  asset_type: AssetType;
  exchange: "SH" | "SZ" | "BJ";
}

export interface Holding {
  id: string;
  thscode: string;
  ticker: string;
  name: string;
  asset_type: AssetType;
  exchange: string;
  average_cost: number;
  quantity: number;
  opened_on: string;
  note: string | null;
  status: HoldingStatus;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  cost_amount: number;
  latest: number | null;
  market_value: number | null;
  floating_gain: number | null;
  floating_gain_percent: number | null;
  change_percent: number | null;
  weight_percent: number | null;
  quoted_at: string | null;
}

export interface HoldingsList {
  status: HoldingStatus;
  items: Holding[];
  data_source: DataSourceSummary;
  market_status: MarketStatus;
  polling_enabled: boolean;
  refresh_seconds: number;
  stale: boolean;
}

export interface HoldingSummary {
  total_cost: number;
  priced_cost: number;
  total_market_value: number | null;
  floating_gain: number | null;
  floating_gain_percent: number | null;
  incomplete: boolean;
  holding_count: number;
  data_source: DataSourceSummary;
  market_status: MarketStatus;
  polling_enabled: boolean;
  refresh_seconds: number;
  stale: boolean;
}

export interface HoldingCreatePayload {
  thscode: string;
  average_cost: number;
  quantity: number;
  opened_on: string;
  note: string | null;
}

export interface HoldingUpdatePayload {
  average_cost?: number;
  quantity?: number;
  opened_on?: string;
  note?: string | null;
}
