import { Check, LoaderCircle, Search } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { ApiError } from "../../lib/api";
import type { Instrument } from "./types";

interface InstrumentSearchState {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data?: { items: Instrument[] };
}

export function HoldingInstrumentField({
  query,
  onQueryChange,
  debouncedQuery,
  selectedInstrument,
  onSelect,
  selectionError,
  search,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  debouncedQuery: string;
  selectedInstrument: Instrument | null;
  onSelect: (instrument: Instrument) => void;
  selectionError: string | null;
  search: InstrumentSearchState;
}) {
  return (
    <div>
      <label htmlFor="holding-instrument-search" className="mb-2 block text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground">
        股票 / ETF
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-3.5 text-muted-foreground/60" size={15} />
        <Input
          id="holding-instrument-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="输入代码或名称，例如 600519、沪深300ETF"
          className="pl-10"
          autoComplete="off"
          aria-label="股票或 ETF"
        />
        {debouncedQuery && !selectedInstrument && (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-60 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-dialog">
            {search.isLoading && (
              <div className="flex items-center gap-2 px-3 py-4 text-[0.85rem] text-muted-foreground">
                <LoaderCircle className="animate-spin" size={14} /> 正在检索标的
              </div>
            )}
            {search.isError && (
              <div className="px-3 py-4 text-[0.85rem] text-market-up">
                {search.error instanceof ApiError ? search.error.message : "标的检索失败"}
              </div>
            )}
            {search.data?.items.map((item) => (
              <button
                key={item.thscode}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-card-deep"
                onClick={() => onSelect(item)}
              >
                <span className="grid size-8 place-items-center rounded border border-border bg-card-deep font-mono text-[0.7rem] text-muted-foreground">
                  {item.exchange}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.95rem] font-semibold text-foreground">{item.name}</span>
                  <span className="mt-0.5 block font-mono text-[0.7rem] text-muted-foreground/60">{item.thscode}</span>
                </span>
                <Badge variant="neutral">{item.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>
              </button>
            ))}
            {search.data?.items.length === 0 && (
              <div className="px-3 py-4 text-[0.85rem] text-muted-foreground">没有找到可持有的 A 股或 ETF</div>
            )}
          </div>
        )}
      </div>
      {selectedInstrument && (
        <div className="mt-2 flex items-center gap-2 text-[0.8rem] text-market-down">
          <Check size={13} /> 已选择 {selectedInstrument.thscode} · {selectedInstrument.name}
        </div>
      )}
      {selectionError && <p className="mt-1.5 text-[0.8rem] text-danger">{selectionError}</p>}
    </div>
  );
}
