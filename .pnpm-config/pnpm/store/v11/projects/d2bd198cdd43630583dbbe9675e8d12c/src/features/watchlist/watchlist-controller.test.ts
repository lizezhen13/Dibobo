import { describe, expect, it } from "vitest";

import { compareValues, parseWatchlistUrlState } from "./use-watchlist-controller";

describe("watchlist controller pure logic", () => {
  it("parses filters, sort and page from shareable URL state", () => {
    const state = parseWatchlistUrlState("keyword=bank&asset_type=fund_etf&sort=change_percent&direction=desc&page=3");
    expect(state).toEqual({
      filters: { keyword: "bank", asset_type: "fund_etf" },
      sort: { key: "change_percent", direction: "desc" },
      page: 3,
    });
  });

  it("puts missing values after available values", () => {
    expect(compareValues(null, 1)).toBeGreaterThan(0);
    expect(compareValues(1, null)).toBeLessThan(0);
    expect(compareValues("A", "B")).toBeLessThan(0);
  });
});
