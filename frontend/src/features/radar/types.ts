export type RadarSyncState =
  | "not_configured"
  | "not_synced"
  | "syncing"
  | "ready"
  | "partial_failed"
  | "failed"
  | "unsupported";

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
  state: RadarSyncState;
  data_source_name: string | null;
  message: string | null;
  snapshot_id: string | null;
  snapshot_time: string | null;
  started_at: string | null;
  completed_at: string | null;
  instrument_count: number;
  eligible_count: number;
  incomplete_count: number;
  excluded_count: number;
  total_market_cap_supported: boolean;
  can_search: boolean;
}

export interface RadarSearchPayload {
  search_id?: string;
  filters: RadarFilters;
  page: number;
  page_size: number;
  sort_by: RadarSortField;
  sort_direction: SortDirection;
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
  missing_reasons: string[];
}

export interface RadarSearchResult {
  search_id: string;
  snapshot_id: string;
  snapshot_time: string;
  page: number;
  page_size: number;
  total: number;
  pages: number;
  incomplete_total: number;
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
