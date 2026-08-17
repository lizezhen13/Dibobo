import { describe, expect, it } from "vitest";

import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  it("keeps list keys scoped by their filters", () => {
    expect(queryKeys.watchlist.list({ keyword: "bank" })).not.toEqual(queryKeys.watchlist.list({ keyword: "energy" }));
    expect(queryKeys.portfolios.holdingsRoot("portfolio-1")).toEqual(["portfolios", "portfolio-1", "holdings"]);
  });

  it("supports prefix invalidation for user-owned resources", () => {
    const holdingKey = queryKeys.portfolios.holdings("portfolio-1", "open", {});
    expect(holdingKey.slice(0, 3)).toEqual(["portfolios", "portfolio-1", "holdings"]);
    expect(queryKeys.auth.session).toEqual(["auth", "session"]);
  });
});
