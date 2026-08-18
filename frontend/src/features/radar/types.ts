export interface RadarFilters {
  market_cap_min: number | null;
  market_cap_max: number | null;
  dividend_yield_min: number | null;
  dividend_yield_max: number | null;
  pb_min: number | null;
  pb_max: number | null;
  pe_min: number | null;
  pe_max: number | null;
}

export interface RadarItem {
  thscode: string;
  ticker: string;
  name: string;
  exchange: "SH" | "SZ";
  latest: number | null;
  change_percent: number | null;
  market_cap: number | null;
  dividend_yield: number | null;
  pb: number | null;
  pe_ttm: number | null;
  industry: string | null;
  quoted_at: string | null;
  data_quality: "complete" | "incomplete";
  missing_fields: string[];
  in_watchlist: boolean;
}

export type RadarDataSourceState =
  | "ready"
  | "not_configured"
  | "authentication_failed"
  | "rate_limited"
  | "unavailable";

export interface RadarResponse {
  items: RadarItem[];
  total: number;
  page: number;
  page_size: number;
  filters: RadarFilters;
  result_type: "daily" | "manual";
  snapshot_status: "success" | "failed" | "never";
  generated_at: string | null;
  daily_snapshot_at: string | null;
  daily_snapshot_error: string | null;
  data_source: {
    state: RadarDataSourceState;
    name: string | null;
    message: string | null;
  };
  stale: boolean;
}

export interface RadarSearchPayload {
  filters: RadarFilters;
  page: number;
  page_size: number;
}

export interface RadarWatchlistPayload {
  thscode: string;
  name: string;
  industry: string | null;
}
