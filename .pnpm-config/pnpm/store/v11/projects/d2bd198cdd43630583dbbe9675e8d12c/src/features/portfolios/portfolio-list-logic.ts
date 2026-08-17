import type { Holding } from "../holdings/types";
import type { HoldingSortState } from "./use-portfolios-url";

export function reconcileOrderIds(orderIds: string[], itemIds: string[]): string[] {
  const itemIdSet = new Set(itemIds);
  const retained = orderIds.filter((id) => itemIdSet.has(id));
  const retainedSet = new Set(retained);
  return [...retained, ...itemIds.filter((id) => !retainedSet.has(id))];
}

export function applyHoldingOrder(items: Holding[], orderIds: string[]): Holding[] {
  if (orderIds.length === 0) return items;
  const orderMap = new Map(orderIds.map((id, index) => [id, index]));
  return [...items].sort(
    (left, right) => (orderMap.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function sortHoldings(items: Holding[], sort: HoldingSortState): Holding[] {
  if (!sort) return items;
  return [...items].sort((left, right) => {
    const leftValue = getHoldingSortValue(left, sort.key);
    const rightValue = getHoldingSortValue(right, sort.key);
    if (leftValue === null && rightValue === null) return 0;
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;

    const comparison =
      typeof leftValue === "string" && typeof rightValue === "string"
        ? leftValue.localeCompare(rightValue)
        : Number(leftValue) - Number(rightValue);
    return sort.direction === "asc" ? comparison : -comparison;
  });
}

function getHoldingSortValue(holding: Holding, key: NonNullable<HoldingSortState>["key"]): number | string | null {
  switch (key) {
    case "market_value":
      return holding.market_value;
    case "floating_gain":
      return holding.floating_gain;
    case "floating_gain_percent":
      return holding.floating_gain_percent;
    case "weight_percent":
      return holding.weight_percent;
    case "opened_on":
      return holding.opened_on;
  }
}
