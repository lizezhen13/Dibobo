import { z } from "zod";

const groupKeySchema = z.enum(["indices", "fx", "commodities", "yields"]);
const valueKindSchema = z.enum(["point", "exchange_rate", "price", "yield"]);
const stateSchema = z.enum(["ready", "partial", "stale", "unavailable"]);
const freshnessSchema = z.enum(["fresh", "delayed", "interrupted", "stale", "unknown"]);
const marketStatusSchema = z.enum(["交易中", "已收盘", "休市", "未知", "不适用"]);

const itemSchema = z
  .object({
    id: z.string(),
    group: groupKeySchema,
    subgroup: z.string().nullable(),
    name: z.string(),
    display_code: z.string(),
    source_symbol: z.string().nullable(),
    value_kind: valueKindSchema,
    latest: z.number().nullable(),
    change: z.number().nullable(),
    change_percent: z.number().nullable(),
    change_bp: z.number().nullable(),
    unit: z.string(),
    quote_direction: z.string().nullable(),
    precision: z.number(),
    market_status: marketStatusSchema,
    freshness: freshnessSchema,
    quoted_at: z.string().nullable(),
    as_of_date: z.string().nullable(),
    fetched_at: z.string().nullable(),
    mapped_contract: z.string().nullable(),
    provider_type: z.string().nullable(),
    adapter_version: z.string().nullable(),
    capability: z.string().nullable(),
    origin: z.string().nullable(),
    missing_reason: z.string().nullable(),
    snapshot_id: z.string().nullable(),
    quality_profile: z.string(),
    source_status: z.string().nullable(),
  })
  .passthrough();

const groupDataSchema = z
  .object({
    state: stateSchema,
    updated_at: z.string().nullable(),
    is_fetching: z.boolean(),
    expected_count: z.number(),
    available_count: z.number(),
    items: z.array(itemSchema),
    message: z.string().nullable(),
  })
  .passthrough();

export const globalMarketResponseSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.object({ type: z.string(), version: z.string() }).passthrough(),
    refresh_seconds: z.number(),
    polling_enabled: z.boolean(),
    groups: z
      .object({
        indices: groupDataSchema,
        fx: groupDataSchema,
        commodities: groupDataSchema,
        yields: groupDataSchema,
      })
      .passthrough(),
    message: z.string().nullable(),
  })
  .passthrough();

export const globalMarketRefreshSchema = z
  .object({
    group: groupKeySchema,
    state: stateSchema,
    acquired: z.boolean(),
    message: z.string().nullable(),
  })
  .passthrough();
