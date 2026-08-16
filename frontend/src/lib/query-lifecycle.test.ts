import { describe, expect, it } from "vitest";

import { pollingJitter } from "./query-lifecycle";

describe("pollingJitter", () => {
  it("is stable for a query key and stays within the configured range", () => {
    const first = pollingJitter("overview-indices");
    expect(pollingJitter("overview-indices")).toBe(first);
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThan(1.08);
  });
});
