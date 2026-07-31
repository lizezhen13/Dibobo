export type MarketStatus = "交易中" | "午间休市" | "已收盘" | "休市" | "未知";

export type DataSourceState =
  | "ready"
  | "not_configured"
  | "authentication_failed"
  | "rate_limited"
  | "unavailable";

export interface IndexCardData {
  name: string;
  thscode: string;
  latest: number | null;
  change: number | null;
  change_percent: number | null;
  turnover: number | null;
  market_status: MarketStatus;
  quoted_at: string | null;
}

export interface OverviewIndices {
  data_source: {
    state: DataSourceState;
    name: string | null;
    message: string | null;
  };
  market_status: MarketStatus;
  polling_enabled: boolean;
  refresh_seconds: number;
  stale: boolean;
  indices: IndexCardData[];
}

