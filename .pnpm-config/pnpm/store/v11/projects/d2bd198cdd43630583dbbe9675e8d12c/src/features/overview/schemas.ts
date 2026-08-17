import { z } from "zod";

const dataSourceSchema = z
  .object({
    state: z.enum(["ready", "not_configured", "authentication_failed", "rate_limited", "unavailable"]),
    name: z.string().nullable(),
    message: z.string().nullable(),
  })
  .passthrough();

const marketStatusSchema = z.enum(["交易中", "午间休市", "已收盘", "休市", "未知"]);
const rankTrendSchema = z.enum(["up", "down", "flat", "unknown"]);

const overviewCoreSchema = {
  data_source: dataSourceSchema,
  market_status: marketStatusSchema,
  polling_enabled: z.boolean(),
  refresh_seconds: z.number(),
  stale: z.boolean(),
};

const overviewModuleSchema = {
  ...overviewCoreSchema,
  updated_at: z.string().nullable(),
};

export const overviewIndicesSchema = z
  .object({
    ...overviewCoreSchema,
    indices: z.array(
      z
        .object({
          name: z.string(),
          thscode: z.string(),
          latest: z.number().nullable(),
          high: z.number().nullable(),
          low: z.number().nullable(),
          change: z.number().nullable(),
          change_percent: z.number().nullable(),
          turnover: z.number().nullable(),
          market_status: marketStatusSchema,
          quoted_at: z.string().nullable(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const hotStockItemSchema = z
  .object({
    thscode: z.string(),
    ticker: z.string(),
    name: z.string(),
    rank: z.number(),
    heat: z.string(),
    rank_change: z.number().nullable(),
    rank_trend: rankTrendSchema,
  })
  .passthrough();

export const overviewHotStocksSchema = z
  .object({
    ...overviewModuleSchema,
    items: z.array(hotStockItemSchema),
  })
  .passthrough();

const industryItemSchema = z
  .object({
    thscode: z.string(),
    name: z.string(),
    latest: z.number().nullable(),
    change: z.number().nullable(),
    change_percent: z.number().nullable(),
    turnover: z.number().nullable(),
  })
  .passthrough();

export const overviewIndustriesSchema = z
  .object({
    ...overviewModuleSchema,
    total: z.number(),
    items: z.array(industryItemSchema),
  })
  .passthrough();

const distributionBinSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    count: z.number(),
  })
  .passthrough();

export const overviewMarketBreadthSchema = z
  .object({
    ...overviewModuleSchema,
    total_count: z.number(),
    valid_count: z.number(),
    up_count: z.number(),
    down_count: z.number(),
    flat_count: z.number(),
    strong_up_count: z.number(),
    strong_down_count: z.number(),
    turnover: z.number(),
    bins: z.array(distributionBinSchema),
  })
  .passthrough();

export const overviewMarketTemperatureSchema = z
  .object({
    ...overviewModuleSchema,
    temperature: z.number().nullable(),
    description: z.string().nullable(),
    valuation: z.number().nullable(),
    sentiment: z.number().nullable(),
  })
  .passthrough();
