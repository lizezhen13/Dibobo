import {
  GLOBAL_MARKET_GROUPS,
  catalogForGroup,
  type GlobalMarketGroupData,
  type GlobalMarketGroupKey,
  type GlobalMarketItem,
} from "./global-market-types";

export const EMPTY_VALUE = "—";

export function formatValue(value: number | null, precision: number) {
  if (value === null || !Number.isFinite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    useGrouping: true,
  }).format(value);
}

export function formatSigned(value: number | null, precision: number) {
  if (value === null || !Number.isFinite(value)) return EMPTY_VALUE;
  const formatted = formatValue(Math.abs(value), precision);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

export function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return EMPTY_VALUE;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatBp(value: number | null) {
  if (value === null || !Number.isFinite(value)) return EMPTY_VALUE;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} bp`;
}

export function formatTime(value: string | null) {
  if (!value) return EMPTY_VALUE;
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDate(value: string | null) {
  if (!value) return EMPTY_VALUE;
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replaceAll("/", "-");
}

export function movement(value: number | null) {
  if (value === null || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-market-up" : "text-market-down";
}

export function stateTone(state: GlobalMarketGroupData["state"]) {
  switch (state) {
    case "ready":
      return "text-success";
    case "partial":
      return "text-warning";
    case "stale":
      return "text-warning";
    default:
      return "text-danger";
  }
}

export function stateLabel(state: GlobalMarketGroupData["state"]) {
  switch (state) {
    case "ready":
      return "数据就绪";
    case "partial":
      return "部分数据";
    case "stale":
      return "缓存值";
    default:
      return "数据不可用";
  }
}

export function freshnessLabel(value: GlobalMarketItem["freshness"]) {
  switch (value) {
    case "fresh":
      return "最新数据";
    case "delayed":
      return "延迟";
    case "interrupted":
      return "数据中断";
    case "stale":
      return "缓存值";
    default:
      return "未知";
  }
}

export function statusTone(status: GlobalMarketItem["market_status"]) {
  if (status === "交易中") return "text-success";
  if (status === "未知") return "text-warning";
  return "text-muted-foreground";
}

export function quoteDirection(item: GlobalMarketItem) {
  if (!item.quote_direction) return null;
  return item.quote_direction.replace("X", formatValue(item.latest, item.precision));
}

export function materializeItems(group: GlobalMarketGroupKey, data: GlobalMarketGroupData | undefined): GlobalMarketItem[] {
  const byId = new Map((data?.items ?? []).map((item) => [item.id, item]));
  return catalogForGroup(group).map((definition) => {
    const item = byId.get(definition.id);
    if (item) return item;
    return {
      id: definition.id,
      group,
      subgroup: definition.subgroup,
      name: definition.name,
      display_code: definition.displayCode,
      source_symbol: null,
      value_kind: definition.valueKind,
      latest: null,
      change: null,
      change_percent: null,
      change_bp: null,
      unit: definition.unit,
      quote_direction: definition.quoteDirection,
      precision: definition.precision,
      market_status: "未知",
      freshness: "unknown",
      quoted_at: null,
      as_of_date: null,
      fetched_at: null,
      mapped_contract: null,
      provider_type: "akshare",
      adapter_version: "1.18.84",
      capability: null,
      origin: null,
      missing_reason: "后端未返回该固定项目",
      snapshot_id: null,
      quality_profile: "global-market-v1",
      source_status: "missing",
    } satisfies GlobalMarketItem;
  });
}

export type GlobalMarketGroupDefinition = (typeof GLOBAL_MARKET_GROUPS)[number];
