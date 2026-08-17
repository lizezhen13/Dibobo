import { describe, expect, it } from "vitest";

import { reconcileOrderIds } from "./use-portfolios-controller";

describe("portfolio holding order", () => {
  it("drops deleted ids and appends newly loaded holdings", () => {
    expect(reconcileOrderIds(["b", "missing", "a"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });
});
