import { z } from "zod";

const categorySchema = z.enum(["macro", "earnings", "dividend", "split", "closed"]);

const calendarEventSchema = z
  .object({
    id: z.string(),
    provider: z.string(),
    provider_event_id: z.string().nullable(),
    category: categorySchema,
    event_type: z.string().nullable(),
    title: z.string(),
    market: z.string().nullable(),
    country_or_region: z.string().nullable(),
    symbol: z.string().nullable(),
    security_name: z.string().nullable(),
    event_date: z.string(),
    event_datetime: z.string().nullable(),
    timezone: z.string(),
    all_day: z.boolean(),
    financial_market_time: z.string().nullable(),
    importance: z.number().nullable(),
    period: z.string().nullable(),
    actual_value: z.string().nullable(),
    forecast_value: z.string().nullable(),
    previous_value: z.string().nullable(),
    revised_value: z.string().nullable(),
    unit: z.string().nullable(),
    currency: z.string().nullable(),
    content: z.string().nullable(),
    scope_tags: z.array(z.enum(["watchlist", "holding"])),
    details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
    extra_data: z.record(z.string(), z.unknown()),
    source_name: z.string(),
    last_synced_at: z.string(),
  })
  .passthrough();

export const calendarEventsSchema = z
  .object({
    category: categorySchema,
    from: z.string(),
    to: z.string(),
    timezone: z.string(),
    items: z.array(calendarEventSchema),
    groups: z.array(
      z
        .object({
          event_date: z.string(),
          items: z.array(calendarEventSchema),
        })
        .passthrough(),
    ),
    next_cursor: z.string().nullable(),
    last_synced_at: z.string().nullable(),
    data_source: z
      .object({
        name: z.string(),
        state: z.enum(["ready", "stale", "error", "missing"]),
        message: z.string().nullable(),
      })
      .passthrough(),
  })
  .passthrough();

export const calendarFiltersSchema = z
  .object({
    category: categorySchema,
    markets: z.array(z.string()),
    importance: z.array(z.number()),
    scopes: z.array(z.enum(["all", "watchlist", "holding"])),
  })
  .passthrough();
