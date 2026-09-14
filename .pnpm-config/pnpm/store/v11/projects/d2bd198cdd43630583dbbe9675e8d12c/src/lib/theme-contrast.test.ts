import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

const palette = Object.fromEntries(
  [...css.matchAll(/--([a-z-]+):\s*#([0-9a-f]{6});/g)].map(([, name, hex]) => [
    name!,
    [0, 2, 4].map((offset) => parseInt(hex!.slice(offset, offset + 2), 16)),
  ]),
);
function luminance(rgb: number[]) {
  const linear = rgb.map((value) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
function contrast(a: number[], b: number[]) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function blend(fg: number[], bg: number[], alpha: number) {
  return fg.map((value, index) => value * alpha + bg[index]! * (1 - alpha));
}

describe("readable dark theme", () => {
  const surfaces = [
    palette.background!,
    palette.card!,
    palette["card-deep"]!,
    palette.secondary!,
    blend(palette.primary!, palette.card!, 0.1),
    blend([255, 255, 255], palette.card!, 0.035),
  ];
  it.each([
    "foreground",
    "muted-foreground",
    "subtle",
    "primary-text",
    "market-up",
    "market-down",
    "market-flat",
    "warning",
    "danger",
    "success",
    "info",
  ])("keeps %s readable on normal, selected and hovered surfaces", (token) => {
    for (const surface of surfaces) expect(contrast(palette[token]!, surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps filled button text readable", () => {
    for (const background of ["primary", "primary-hover"])
      expect(contrast(palette["primary-foreground"]!, palette[background]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette["destructive-foreground"]!, palette.destructive!)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps necessary form boundaries and focus indicators visible", () => {
    for (const token of ["input", "ring"])
      for (const background of ["background", "card", "secondary"])
        expect(contrast(palette[token]!, palette[background]!)).toBeGreaterThanOrEqual(3);
  });
});
