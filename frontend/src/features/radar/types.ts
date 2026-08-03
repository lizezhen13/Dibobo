export type RadarAvailabilityState = "not_configured" | "ready" | "unsupported";

export type RadarSearchState = "queued" | "running" | "ready" | "failed";

export type RadarSearchStage =
  | "queued"
  | "universe"
  | "quotes"
  | "valuation"
  | "fundamentals"
  | "finalizing"
  | "ready"
  | "failed";

export type RadarSortField =
  | "latest"
  | "change_percent"
  | "total_market_cap"
  | "dividend_yield_ttm"
  | "pb_mrq"
  | "roe_weighted"
  | "consecutive_dividend_years";

export type SortDirection = "asc" | "desc";

export interface NumberRange {
  minimum: number | null;
  maximum: number | null;
}

export interface RadarFilters {
  total_market_cap: NumberRange;
  dividend_yield_ttm: NumberRange;
  pb_mrq: NumberRange;
  roe_weighted: NumberRange;
}

export interface RadarStatus {
  state: RadarAvailabilityState;
  data_source_name: string | null;
  message: string | null;
  cache_instrument_count: number;
  cache_updated_at: string | null;
  total_market_cap_supported: boolean;
  can_search: boolean;
}

export interface RadarSearchPayload {
  filters: RadarFilters;
  page_size: number;
  sort_by: RadarSortField;
  sort_direction: SortDirection;
}

export interface RadarSearchQueued {
  search_id: string;
  state: "queued" | "running" | "ready";
  message: string;
}

export interface RadarSearchStatus {
  search_id: string;
  state: RadarSearchState;
  stage: RadarSearchStage;
  message: string | null;
  processed_count: number;
  candidate_count: number;
  total_results: number;
  incomplete_results: number;
  stale_results: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string;
  error_summary: string | null;
}

export interface RadarResultItem {
  thscode: string;
  ticker: string;
  name: string;
  exchange: string;
  latest: number | null;
  change_percent: number | null;
  total_market_cap: number | null;
  dividend_yield_ttm: number | null;
  pb_mrq: number | null;
  roe_weighted: number | null;
  roe_report_period: string | null;
  consecutive_dividend_years: number | null;
  metric_time: string | null;
  quoted_at: string | null;
  data_incomplete: boolean;
  data_stale: boolean;
  missing_reasons: string[];
  stale_fields: string[];
}

export interface RadarSearchResult {
  search_id: string;
  searched_at: string;
  page: number;
  page_size: number;
  total: number;
  pages: number;
  incomplete_total: number;
  stale_total: number;
  sort_by: RadarSortField;
  sort_direction: SortDirection;
  items: RadarResultItem[];
}

export interface RadarQuoteItem {
  thscode: string;
  latest: number | null;
  change_percent: number | null;
  quoted_at: string | null;
}

export interface RadarQuotesResult {
  search_id: string;
  page: number;
  market_status: string;
  polling_enabled: boolean;
  refresh_seconds: number;
  stale: boolean;
  items: RadarQuoteItem[];
}
