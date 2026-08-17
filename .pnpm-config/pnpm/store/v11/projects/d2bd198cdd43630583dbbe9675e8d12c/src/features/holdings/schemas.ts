import { z } from "zod";

const dataSourceSummarySchema = z
  .object({
    state: z.enum(["ready", "not_configured", "authentication_failed", "rate_limited", "unavailable"]),
    name: z.string().nullable(),
    message: z.string().nullable(),
  })
  .passthrough();

const marketStatusSchema = z.enum(["交易中", "午间休市", "已收盘", "休市", "未知"]);
const assetTypeSchema = z.enum(["a_share", "fund_etf"]);
const holdingStatusSchema = z.enum(["open", "closed"]);

export const portfolioSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    note: z.string().nullable(),
    is_default: z.boolean(),
    sort_order: z.number(),
    open_holding_count: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();

export const portfolioListSchema = z
  .object({
    items: z.array(portfolioSchema),
  })
  .passthrough();

export const holdingSchema = z
  .object({
    id: z.string(),
    thscode: z.string(),
    ticker: z.string(),
    name: z.string(),
    asset_type: assetTypeSchema,
    exchange: z.string(),
    average_cost: z.number(),
    quantity: z.number(),
    opened_on: z.string(),
    note: z.string().nullable(),
    sort_order: z.number(),
    status: holdingStatusSchema,
    closed_quantity: z.number().nullable(),
    close_price: z.number().nullable(),
    closed_on: z.string().nullable(),
    closed_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    cost_amount: z.number(),
    close_amount: z.number().nullable(),
    realized_gain: z.number().nullable(),
    realized_gain_percent: z.number().nullable(),
    latest: z.number().nullable(),
    market_value: z.number().nullable(),
    floating_gain: z.number().nullable(),
    floating_gain_percent: z.number().nullable(),
    change_percent: z.number().nullable(),
    weight_percent: z.number().nullable(),
    quoted_at: z.string().nullable(),
  })
  .passthrough();

export const holdingsListSchema = z
  .object({
    status: holdingStatusSchema,
    items: z.array(holdingSchema),
    data_source: dataSourceSummarySchema,
    market_status: marketStatusSchema,
    polling_enabled: z.boolean(),
    refresh_seconds: z.number(),
    stale: z.boolean(),
  })
  .passthrough();

export const holdingSummarySchema = z
  .object({
    total_cost: z.number(),
    priced_cost: z.number(),
    total_market_value: z.number().nullable(),
    floating_gain: z.number().nullable(),
    floating_gain_percent: z.number().nullable(),
    incomplete: z.boolean(),
    holding_count: z.number(),
    realized_gain: z.number().nullable(),
    realized_gain_percent: z.number().nullable(),
    realized_incomplete: z.boolean(),
    total_gain: z.number().nullable(),
    data_source: dataSourceSummarySchema,
    market_status: marketStatusSchema,
    polling_enabled: z.boolean(),
    refresh_seconds: z.number(),
    stale: z.boolean(),
  })
  .passthrough();

export const portfolioSummaryListSchema = z
  .object({
    items: z.array(
      z
        .object({
          portfolio_id: z.string(),
          summary: holdingSummarySchema,
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const instrumentSearchSchema = z
  .object({
    items: z.array(
      z
        .object({
          thscode: z.string(),
          ticker: z.string(),
          name: z.string(),
          asset_type: assetTypeSchema,
          exchange: z.enum(["SH", "SZ", "BJ"]),
          industry: z.string().nullable().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
