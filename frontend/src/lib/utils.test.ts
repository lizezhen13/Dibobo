import { describe, expect, it } from "vitest";

import { cn, typographySizes } from "./utils";

describe("project typography composition", () => {
  it.each(typographySizes)("preserves %s together with a text color", (size) => {
    expect(cn(`text-${size}`, "text-market-up")).toBe(`text-${size} text-market-up`);
    expect(cn("text-foreground", `text-${size}`)).toBe(`text-foreground text-${size}`);
  });

  it("resolves sizes within the same responsive state without discarding colors", () => {
    expect(cn("text-body text-foreground md:text-title", "text-table md:text-heading")).toBe("text-foreground text-table md:text-heading");
    expect(cn("text-sm text-muted-foreground", "text-caption")).toBe("text-muted-foreground text-caption");
    expect(cn("text-body", "text-[18px] text-primary-text")).toBe("text-[18px] text-primary-text");
  });
});
