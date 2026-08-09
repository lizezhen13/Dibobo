export type HoldingStatus = "open" | "closed";
export type AssetType = "a_share" | "fund_etf";
export type MarketStatus = "交易中" | "午间休市" | "已收盘" | "休市" | "未知";

export interface HoldingsFilters {
  keyword: string;
  asset_type: AssetType | "";
  opened_from: string;
  opened_to: string;
}

export interface Portfolio {
  id: string;
  name: string;
  note: string | null;
  is_default: boolean;
  sort_order: number;
  open_holding_count: number;
  created_at: string;
  updated_at: string;
}

export interface PortfolioList {
  items: Portfolio[];
}

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
  industry?: string | null;
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
  sort_order: number;
  status: HoldingStatus;
  closed_quantity: number | null;
  close_price: number | null;
  closed_on: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  cost_amount: number;
  close_amount: number | null;
  realized_gain: number | null;
  realized_gain_percent: number | null;
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
  realized_gain: number | null;
  realized_gain_percent: number | null;
  realized_incomplete: boolean;
  total_gain: number | null;
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
  close_price?: number;
  closed_on?: string;
  closed_quantity?: number;
}

export interface PortfolioCreatePayload {
  name: string;
  note: string | null;
  is_default: boolean;
}

export interface PortfolioUpdatePayload {
  name?: string;
  note?: string | null;
}
