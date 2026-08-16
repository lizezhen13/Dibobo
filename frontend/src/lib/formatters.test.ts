import { describe, expect, it } from "vitest";

import { MISSING_VALUE, formatMoney, formatPercent, formatPoint, formatSignedPoint, formatVolume, movementClass } from "./formatters";

describe("formatters", () => {
  it("uses one placeholder for missing numeric values", () => {
    expect(formatPoint(null)).toBe(MISSING_VALUE);
    expect(formatPercent(null)).toBe(MISSING_VALUE);
    expect(formatMoney(null)).toBe(MISSING_VALUE);
    expect(formatVolume(null)).toBe(MISSING_VALUE);
  });

  it("keeps signs and market color semantics stable", () => {
    expect(formatSignedPoint(12.5)).toBe("+12.50");
    expect(formatSignedPoint(-12.5)).toBe("-12.50");
    expect(formatPercent(1.2)).toBe("+1.20%");
    expect(formatPercent(-1.2)).toBe("-1.20%");
    expect(movementClass(1)).toBe("text-market-up");
    expect(movementClass(-1)).toBe("text-market-down");
    expect(movementClass(0)).toBe("text-muted-foreground");
  });

  it("uses Chinese compact units for money and volume", () => {
    expect(formatMoney(100_000_000)).toBe("1.00 亿元");
    expect(formatMoney(-20_000)).toBe("-2.00 万元");
    expect(formatVolume(12_300)).toContain("万");
  });
});
