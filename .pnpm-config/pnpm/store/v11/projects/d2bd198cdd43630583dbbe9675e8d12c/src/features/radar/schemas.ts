import { z } from "zod";

const radarFiltersSchema = z.object({
  market_cap_min: z.number().nullable(),
  market_cap_max: z.number().nullable(),
  dividend_yield_min: z.number().nullable(),
  dividend_yield_max: z.number().nullable(),
  pb_min: z.number().nullable(),
  pb_max: z.number().nullable(),
  pe_min: z.number().nullable(),
  pe_max: z.number().nullable(),
});

const radarItemSchema = z.object({
  thscode: z.string(),
  ticker: z.string(),
  name: z.string(),
  exchange: z.enum(["SH", "SZ"]),
  latest: z.number().nullable(),
  change_percent: z.number().nullable(),
  market_cap: z.number().nullable(),
  dividend_yield: z.number().nullable(),
  pb: z.number().nullable(),
  pe_ttm: z.number().nullable(),
  industry: z.string().nullable(),
  quoted_at: z.string().nullable(),
  data_quality: z.enum(["complete", "incomplete"]),
  missing_fields: z.array(z.string()),
  in_watchlist: z.boolean(),
});

export const radarResponseSchema = z.object({
  items: z.array(radarItemSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  filters: radarFiltersSchema,
  result_type: z.enum(["daily", "manual"]),
  snapshot_status: z.enum(["success", "failed", "never"]),
  generated_at: z.string().nullable(),
  daily_snapshot_at: z.string().nullable(),
  daily_snapshot_error: z.string().nullable(),
  data_source: z.object({
    state: z.enum(["ready", "not_configured", "authentication_failed", "rate_limited", "unavailable"]),
    name: z.string().nullable(),
    message: z.string().nullable(),
  }),
  stale: z.boolean(),
});
