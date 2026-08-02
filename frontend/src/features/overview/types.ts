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
  high: number | null;
  low: number | null;
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

export interface OverviewModuleData {
  data_source: {
    state: DataSourceState;
    name: string | null;
    message: string | null;
  };
  market_status: MarketStatus;
  polling_enabled: boolean;
  refresh_seconds: number;
  stale: boolean;
  updated_at: string | null;
}

export type RankTrend = "up" | "down" | "flat" | "unknown";

export interface HotStockItem {
  thscode: string;
  ticker: string;
  name: string;
  rank: number;
  heat: string;
  rank_change: number | null;
  rank_trend: RankTrend;
}

export interface OverviewHotStocks extends OverviewModuleData {
  items: HotStockItem[];
}

export interface DragonTigerItem {
  thscode: string;
  ticker: string;
  name: string;
  change: number | null;
  net_value: number | null;
  net_rate: number | null;
  hot_rank: number | null;
  range_days: number | null;
  org_net_value: number | null;
  hot_money_net_value: number | null;
  limit_reason: string | null;
}

export interface OverviewDragonTiger extends OverviewModuleData {
  trade_date: string | null;
  summary: {
    net_value: number;
    org_net_value: number;
    hot_money_net_value: number;
  };
  items: DragonTigerItem[];
}

export interface IndustryIndexItem {
  thscode: string;
  name: string;
  latest: number | null;
  change: number | null;
  change_percent: number | null;
  turnover: number | null;
}

export interface OverviewIndustries extends OverviewModuleData {
  total: number;
  items: IndustryIndexItem[];
}

export interface DistributionBin {
  key: string;
  label: string;
  count: number;
}

export interface OverviewMarketBreadth extends OverviewModuleData {
  total_count: number;
  valid_count: number;
  up_count: number;
  down_count: number;
  flat_count: number;
  strong_up_count: number;
  strong_down_count: number;
  turnover: number;
  bins: DistributionBin[];
}
