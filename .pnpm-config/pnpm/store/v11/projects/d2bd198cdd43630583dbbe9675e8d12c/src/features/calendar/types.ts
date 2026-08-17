export const CALENDAR_CATEGORIES = ["macro", "earnings", "dividend", "split", "closed"] as const;

export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];
export type CalendarScope = "all" | "watchlist" | "holding";

export interface CalendarEvent {
  id: string;
  provider: string;
  provider_event_id: string | null;
  category: CalendarCategory;
  event_type: string | null;
  title: string;
  market: string | null;
  country_or_region: string | null;
  symbol: string | null;
  security_name: string | null;
  event_date: string;
  event_datetime: string | null;
  timezone: string;
  all_day: boolean;
  financial_market_time: string | null;
  importance: number | null;
  period: string | null;
  actual_value: string | null;
  forecast_value: string | null;
  previous_value: string | null;
  revised_value: string | null;
  unit: string | null;
  currency: string | null;
  content: string | null;
  scope_tags: Array<"watchlist" | "holding">;
  details: Record<string, string | number | null>;
  extra_data: Record<string, unknown>;
  source_name: string;
  last_synced_at: string;
}

export interface CalendarEventGroup {
  event_date: string;
  items: CalendarEvent[];
}

export interface CalendarDataSource {
  name: string;
  state: "ready" | "stale" | "error" | "missing";
  message: string | null;
}

export interface CalendarEventsResponse {
  category: CalendarCategory;
  from: string;
  to: string;
  timezone: string;
  items: CalendarEvent[];
  groups: CalendarEventGroup[];
  next_cursor: string | null;
  last_synced_at: string | null;
  data_source: CalendarDataSource;
}

export interface CalendarFiltersResponse {
  category: CalendarCategory;
  markets: string[];
  importance: number[];
  scopes: CalendarScope[];
}

export interface CalendarQueryParams {
  category: CalendarCategory;
  from: string;
  to: string;
  markets: string[];
  scope: CalendarScope;
  importance: number[];
}
