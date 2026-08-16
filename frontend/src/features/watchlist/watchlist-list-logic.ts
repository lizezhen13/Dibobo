import type { WatchlistItem } from "./types";
import type { SortKey, SortState } from "./use-watchlist-url";

export function sortWatchlistItems(items: WatchlistItem[], sort: SortState): WatchlistItem[] {
  if (sort.key === "custom") return items;
  return [...items].sort((left, right) => {
    const comparison = compareValues(sortValue(left, sort.key), sortValue(right, sort.key));
    return sort.direction === "asc" ? comparison : -comparison;
  });
}

export function compareValues(left: number | string | null, right: number | string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "zh-CN");
}

function sortValue(item: WatchlistItem, key: SortKey): number | string | null {
  switch (key) {
    case "latest":
      return item.latest;
    case "change":
      return item.change;
    case "change_percent":
      return item.change_percent;
    case "volume":
      return item.volume;
    case "turnover":
      return item.turnover;
    case "added_at":
      return item.added_at;
    case "custom":
      return item.sort_order;
  }
}
