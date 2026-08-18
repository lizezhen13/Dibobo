type CalendarKeyParams = {
  category: string;
  from: string;
  to: string;
  markets: readonly string[];
  scope: string;
  importance: readonly (string | number)[];
};

export const queryKeys = {
  auth: {
    session: ["auth", "session"] as const,
  },
  holdings: {
    all: ["holdings"] as const,
    list: (status: string, filters: unknown) => ["holdings", status, filters] as const,
    summary: ["holdings", "summary"] as const,
  },
  portfolios: {
    all: ["portfolios"] as const,
    root: (portfolioId: string) => ["portfolios", portfolioId] as const,
    holdingsRoot: (portfolioId: string) => ["portfolios", portfolioId, "holdings"] as const,
    holdings: (portfolioId: string, status: string, filters: unknown) => ["portfolios", portfolioId, "holdings", status, filters] as const,
    emptyHoldings: (status: string, filters: unknown) => ["portfolios", "empty", "holdings", status, filters] as const,
    summary: (portfolioId: string) => ["portfolios", portfolioId, "summary"] as const,
    summariesRoot: ["portfolios", "summaries"] as const,
    summaries: (portfolioIds: readonly string[]) => ["portfolios", "summaries", portfolioIds] as const,
    emptySummary: ["portfolios", "empty", "summary"] as const,
  },
  instruments: {
    search: (keyword: string) => ["instruments", "search", keyword] as const,
  },
  watchlist: {
    all: ["watchlist"] as const,
    list: (filters: unknown) => ["watchlist", filters] as const,
  },
  journals: {
    all: ["journals"] as const,
    list: (filters: unknown) => ["journals", filters] as const,
  },
  calendar: {
    events: (params: CalendarKeyParams) =>
      [
        "calendar-events-v3",
        params.category,
        params.from,
        params.to,
        params.markets.join(","),
        params.scope,
        params.importance.join(","),
      ] as const,
    filters: (category: string) => ["calendar-filters", category] as const,
  },
  overview: {
    all: ["overview"] as const,
    module: (slug: string) => ["overview", slug] as const,
    globalMarket: ["overview", "global-market"] as const,
  },
  settings: {
    dataSources: ["settings", "data-sources"] as const,
  },
  radar: {
    daily: (page: number, pageSize: number) => ["radar", "daily", page, pageSize] as const,
  },
} as const;
