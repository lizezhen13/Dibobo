export type { DataSourceState, MarketStatus } from "../../domain/market";
import type { DataSourceState, MarketStatus } from "../../domain/market";

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

export interface OverviewMarketTemperature extends OverviewModuleData {
  temperature: number | null;
  description: string | null;
  valuation: number | null;
  sentiment: number | null;
}
