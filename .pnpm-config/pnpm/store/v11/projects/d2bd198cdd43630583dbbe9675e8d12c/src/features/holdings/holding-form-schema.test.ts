import { describe, expect, it } from "vitest";

import { createHoldingSchema, getHoldingFormDefaults, toHoldingUpdatePayload } from "./holding-form-schema";
import type { Holding } from "./types";

describe("holding form schema and mapper", () => {
  it("maps a closed holding without leaking open-position fields", () => {
    const holding = {
      status: "closed",
      average_cost: 12.5,
      quantity: 0,
      close_price: 14,
      closed_on: "2026-01-05",
      closed_quantity: 10,
      latest: null,
      note: "旧备注",
    } as Holding;

    expect(
      toHoldingUpdatePayload(
        {
          average_cost: "12.5",
          quantity: "0",
          opened_on: "2025-01-01",
          note: " 新备注 ",
          close_price: "15",
          closed_on: "2026-01-06",
          closed_quantity: "10",
        },
        holding,
      ),
    ).toEqual({
      note: "新备注",
      close_price: 15,
      closed_on: "2026-01-06",
      closed_quantity: 10,
    });
  });

  it("requires close details when an open holding is reduced to zero", () => {
    const result = createHoldingSchema(true, false).safeParse({
      average_cost: "12.5",
      quantity: "0",
      opened_on: "2026-01-01",
      note: "",
      close_price: "",
      closed_on: "",
      closed_quantity: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(["close_price", "closed_on"]));
    }
  });

  it("keeps create defaults stable and date-aware", () => {
    const defaults = getHoldingFormDefaults(null);
    expect(defaults.average_cost).toBe("");
    expect(defaults.quantity).toBe("");
    expect(defaults.opened_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
