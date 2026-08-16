import { ChevronDown, Check, Search, SlidersHorizontal, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { cn } from "../../lib/utils";
import type { WatchlistAssetType } from "./types";
import type { SortKey } from "./use-watchlist-controller";

export function WatchlistFiltersPanel({
  keyword,
  assetType,
  activeFilterCount,
  isFiltered,
  displayCount,
  sortKey,
  onKeywordChange,
  onAssetTypeChange,
  onClear,
}: {
  keyword: string;
  assetType: WatchlistAssetType | "";
  activeFilterCount: number;
  isFiltered: boolean;
  displayCount: number;
  sortKey: SortKey;
  onKeywordChange: (value: string) => void;
  onAssetTypeChange: (value: WatchlistAssetType | "") => void;
  onClear: () => void;
}) {
  return (
    <div className="relative flex min-h-[128px] flex-col justify-center overflow-hidden rounded-xl border border-border bg-card px-5 py-3 shadow-raised">
      <div className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full border border-primary/10 bg-primary/8 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-px w-3/4 bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
      <div className="relative">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <SlidersHorizontal size={15} />
            </span>
            <div>
              <p className="font-mono text-caption tracking-[0.16em] text-muted-foreground/65">FILTER DECK / WATCHLIST</p>
              <p className="mt-0.5 text-body-sm text-muted-foreground/55">快速定位并缩小观察范围</p>
            </div>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-caption tracking-[0.08em] transition-colors",
              activeFilterCount > 0
                ? "border-primary/25 bg-primary/10 text-primary/90"
                : "border-border/80 bg-background/35 text-muted-foreground/65",
            )}
          >
            <span className={cn("size-1.5 rounded-full", activeFilterCount > 0 ? "bg-primary" : "bg-muted-foreground/45")} />
            {activeFilterCount > 0 ? `${activeFilterCount} 项条件已启用` : "全部标的"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.38fr)]">
          <div className="min-w-0">
            <p className="mb-1.5 text-label font-medium text-muted-foreground">搜索标的</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/65" size={16} />
              <Input
                value={keyword}
                onChange={(event) => onKeywordChange(event.target.value)}
                placeholder="筛选代码或名称"
                className={cn("pl-10 pr-10", keyword && "border-primary/40 bg-primary/[0.04]")}
              />
              {keyword && (
                <button
                  type="button"
                  aria-label="清除关键词"
                  className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  onClick={() => onKeywordChange("")}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-label font-medium text-muted-foreground">标的类型</p>
            <WatchlistTypeFilter value={assetType} onChange={onAssetTypeChange} />
          </div>
        </div>
      </div>
      {(isFiltered || sortKey !== "custom") && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-caption text-muted-foreground/65">
          <div className="flex flex-wrap items-center gap-3">
            {isFiltered && <span>筛选后显示 {displayCount} 条</span>}
            {sortKey !== "custom" && <span className="font-mono tracking-[0.05em]">TEMP SORT · {sortLabel(sortKey)}</span>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X size={14} /> 恢复默认
          </Button>
        </div>
      )}
    </div>
  );
}

function WatchlistTypeFilter({ value, onChange }: { value: WatchlistAssetType | ""; onChange: (value: WatchlistAssetType | "") => void }) {
  const [open, setOpen] = useState(false);
  const options: Array<{ value: WatchlistAssetType | ""; label: string }> = [
    { value: "", label: "全部类型" },
    { value: "a_share", label: "A 股" },
    { value: "fund_etf", label: "ETF" },
  ];
  const selected = options.find((option) => option.value === value) ?? options[0]!;
  const selectedIndex = options.findIndex((option) => option.value === selected.value);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusOption = (index: number) => {
    optionRefs.current[index]?.focus();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) requestAnimationFrame(() => focusOption(selectedIndex));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="标的类型"
          aria-expanded={open}
          className={cn(
            "inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-background px-3.5 text-body-sm text-foreground transition hover:border-primary/40 hover:bg-secondary focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15",
            value ? "border-primary/40 bg-primary/[0.06]" : "border-input",
          )}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-muted-foreground" />
            {selected.label}
          </span>
          <ChevronDown size={15} className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[164px] p-1.5"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => focusOption(selectedIndex));
        }}
      >
        <div
          role="listbox"
          aria-label="标的类型"
          aria-activedescendant={`watchlist-asset-type-${selected.value || "all"}`}
          className="space-y-0.5"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value || "all"}
                ref={(element) => {
                  optionRefs.current[options.indexOf(option)] = element;
                }}
                type="button"
                id={`watchlist-asset-type-${option.value || "all"}`}
                role="option"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-body-sm transition",
                  isSelected
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                onKeyDown={(event) => {
                  const currentIndex = options.indexOf(option);
                  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                    event.preventDefault();
                    focusOption((currentIndex + 1) % options.length);
                  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    focusOption((currentIndex - 1 + options.length) % options.length);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    focusOption(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    focusOption(options.length - 1);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setOpen(false);
                  }
                }}
              >
                <span className="grid w-4 place-items-center">{isSelected && <Check size={14} />}</span>
                {option.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function sortLabel(key: SortKey): string {
  const labels: Record<SortKey, string> = {
    custom: "自定义顺序",
    latest: "最新价",
    change: "涨跌额",
    change_percent: "涨跌幅",
    volume: "成交量",
    turnover: "成交额",
    added_at: "添加时间",
  };
  return labels[key];
}
