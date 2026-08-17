import { z } from "zod";

const assetTypeSchema = z.enum(["a_share", "fund_etf"]);
const marketStatusSchema = z.enum(["交易中", "午间休市", "已收盘", "休市", "未知"]);

const watchlistItemSchema = z
  .object({
    id: z.string(),
    thscode: z.string(),
    ticker: z.string(),
    name: z.string(),
    asset_type: assetTypeSchema,
    exchange: z.string(),
    industry: z.string().nullable(),
    note: z.string().nullable(),
    sort_order: z.number(),
    added_at: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    latest: z.number().nullable(),
    change: z.number().nullable(),
    change_percent: z.number().nullable(),
    volume: z.number().nullable(),
    turnover: z.number().nullable(),
    total_market_cap: z.number().nullable(),
    pe_ttm: z.number().nullable(),
    pe_dynamic: z.number().nullable(),
    pb: z.number().nullable(),
    dividend_yield: z.number().nullable(),
    concept: z.string().nullable(),
    volume_ratio: z.number().nullable(),
    turnover_rate: z.number().nullable(),
    quoted_at: z.string().nullable(),
  })
  .passthrough();

export const watchlistResponseSchema = z
  .object({
    items: z.array(watchlistItemSchema),
    data_source: z
      .object({
        state: z.enum(["ready", "not_configured", "authentication_failed", "rate_limited", "unavailable"]),
        name: z.string().nullable(),
        message: z.string().nullable(),
      })
      .passthrough(),
    market_status: marketStatusSchema,
    polling_enabled: z.boolean(),
    refresh_seconds: z.number(),
    stale: z.boolean(),
  })
  .passthrough();
