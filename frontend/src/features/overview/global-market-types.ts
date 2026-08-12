export type GlobalMarketGroupKey = "indices" | "fx" | "commodities" | "yields";
export type GlobalMarketValueKind = "point" | "exchange_rate" | "price" | "yield";
export type GlobalMarketState = "ready" | "partial" | "stale" | "unavailable";
export type GlobalMarketFreshness = "fresh" | "delayed" | "interrupted" | "stale" | "unknown";
export type GlobalMarketStatus = "交易中" | "已收盘" | "休市" | "未知" | "不适用";

export interface GlobalMarketProvider {
  type: string;
  version: string;
}

export interface GlobalMarketItem {
  id: string;
  group: GlobalMarketGroupKey;
  subgroup: string | null;
  name: string;
  display_code: string;
  source_symbol: string | null;
  value_kind: GlobalMarketValueKind;
  latest: number | null;
  change: number | null;
  change_percent: number | null;
  change_bp: number | null;
  unit: string;
  quote_direction: string | null;
  precision: number;
  market_status: GlobalMarketStatus;
  freshness: GlobalMarketFreshness;
  quoted_at: string | null;
  as_of_date: string | null;
  fetched_at: string | null;
  mapped_contract: string | null;
  provider_type: string | null;
  adapter_version: string | null;
  capability: string | null;
  origin: string | null;
  missing_reason: string | null;
  snapshot_id: string | null;
  quality_profile: string;
  source_status: string | null;
}

export interface GlobalMarketGroupData {
  state: GlobalMarketState;
  updated_at: string | null;
  is_fetching: boolean;
  expected_count: number;
  available_count: number;
  items: GlobalMarketItem[];
  message: string | null;
}

export interface GlobalMarketRefreshResponse {
  group: GlobalMarketGroupKey;
  state: GlobalMarketState;
  acquired: boolean;
  message: string | null;
}

export interface GlobalMarketResponse {
  enabled: boolean;
  provider: GlobalMarketProvider;
  refresh_seconds: number;
  polling_enabled: boolean;
  groups: Record<GlobalMarketGroupKey, GlobalMarketGroupData>;
  message: string | null;
}

export interface GlobalMarketCatalogItem {
  id: string;
  group: GlobalMarketGroupKey;
  subgroup: string | null;
  name: string;
  displayCode: string;
  valueKind: GlobalMarketValueKind;
  unit: string;
  quoteDirection: string | null;
  precision: number;
}

export const GLOBAL_MARKET_CATALOG: GlobalMarketCatalogItem[] = [
  { id: "global-index.hsi", group: "indices", subgroup: "亚洲", name: "恒生指数", displayCode: "HSI", valueKind: "point", unit: "点", quoteDirection: null, precision: 2 },
  { id: "global-index.n225", group: "indices", subgroup: "亚洲", name: "日经225指数", displayCode: "N225", valueKind: "point", unit: "点", quoteDirection: null, precision: 2 },
  { id: "global-index.kospi", group: "indices", subgroup: "亚洲", name: "韩国综合指数", displayCode: "KOSPI", valueKind: "point", unit: "点", quoteDirection: null, precision: 2 },
  { id: "global-index.dji", group: "indices", subgroup: "美国", name: "道琼斯工业指数", displayCode: "DJI", valueKind: "point", unit: "点", quoteDirection: null, precision: 2 },
  { id: "global-index.ixic", group: "indices", subgroup: "美国", name: "纳斯达克综合指数", displayCode: "IXIC", valueKind: "point", unit: "点", quoteDirection: null, precision: 2 },
  { id: "global-index.spx", group: "indices", subgroup: "美国", name: "标普500指数", displayCode: "SPX", valueKind: "point", unit: "点", quoteDirection: null, precision: 2 },
  { id: "global-fx.usd-index", group: "fx", subgroup: null, name: "美元指数", displayCode: "USDIND", valueKind: "point", unit: "指数点位", quoteDirection: null, precision: 3 },
  { id: "global-fx.usd-cnh", group: "fx", subgroup: null, name: "美元/离岸人民币", displayCode: "USDCNH", valueKind: "exchange_rate", unit: "CNH", quoteDirection: "1 USD = X CNH", precision: 4 },
  { id: "global-fx.hkd-cnh", group: "fx", subgroup: null, name: "港币/离岸人民币", displayCode: "HKDCNH", valueKind: "exchange_rate", unit: "CNH", quoteDirection: "1 HKD = X CNH", precision: 4 },
  { id: "global-commodity.xauusd", group: "commodities", subgroup: "伦敦现货", name: "伦敦金现", displayCode: "XAUUSD", valueKind: "price", unit: "美元/盎司", quoteDirection: null, precision: 2 },
  { id: "global-commodity.xagusd", group: "commodities", subgroup: "伦敦现货", name: "伦敦银现", displayCode: "XAGUSD", valueKind: "price", unit: "美元/盎司", quoteDirection: null, precision: 3 },
  { id: "global-commodity.gc", group: "commodities", subgroup: "纽约期货", name: "纽约金主连", displayCode: "GC", valueKind: "price", unit: "美元/盎司", quoteDirection: null, precision: 2 },
  { id: "global-commodity.si", group: "commodities", subgroup: "纽约期货", name: "纽约银主连", displayCode: "SI", valueKind: "price", unit: "美元/盎司", quoteDirection: null, precision: 3 },
  { id: "global-commodity.au", group: "commodities", subgroup: "国内期货", name: "沪金主连", displayCode: "AU", valueKind: "price", unit: "元/克", quoteDirection: null, precision: 2 },
  { id: "global-commodity.ag", group: "commodities", subgroup: "国内期货", name: "沪银主连", displayCode: "AG", valueKind: "price", unit: "元/千克", quoteDirection: null, precision: 0 },
  { id: "global-commodity.brent", group: "commodities", subgroup: "能源", name: "布伦特原油主连", displayCode: "BRENT", valueKind: "price", unit: "美元/桶", quoteDirection: null, precision: 2 },
  { id: "global-commodity.cl", group: "commodities", subgroup: "能源", name: "美原油主连", displayCode: "CL", valueKind: "price", unit: "美元/桶", quoteDirection: null, precision: 2 },
  { id: "global-yield.cn1y", group: "yields", subgroup: "中国", name: "中国1年期国债收益率", displayCode: "CN1Y", valueKind: "yield", unit: "%", quoteDirection: null, precision: 3 },
  { id: "global-yield.cn10y", group: "yields", subgroup: "中国", name: "中国10年期国债收益率", displayCode: "CN10Y", valueKind: "yield", unit: "%", quoteDirection: null, precision: 3 },
  { id: "global-yield.us1y", group: "yields", subgroup: "美国", name: "美国1年期国债收益率", displayCode: "US1Y", valueKind: "yield", unit: "%", quoteDirection: null, precision: 3 },
  { id: "global-yield.us10y", group: "yields", subgroup: "美国", name: "美国10年期国债收益率", displayCode: "US10Y", valueKind: "yield", unit: "%", quoteDirection: null, precision: 3 },
];

export const GLOBAL_MARKET_GROUPS: Array<{
  key: GlobalMarketGroupKey;
  title: string;
  label: string;
}> = [
  { key: "indices", title: "全球指数", label: "GLOBAL INDICES" },
  { key: "fx", title: "汇率情况", label: "FX MARKET" },
  { key: "commodities", title: "全球商品", label: "GLOBAL COMMODITIES" },
  { key: "yields", title: "国债收益率", label: "GOVERNMENT YIELDS" },
];

export function catalogForGroup(group: GlobalMarketGroupKey) {
  return GLOBAL_MARKET_CATALOG.filter((item) => item.group === group);
}
