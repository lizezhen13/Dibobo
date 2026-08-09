import { Check, LoaderCircle, Search, Star, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { ApiError } from "../../lib/api";
import { useInstrumentSearchQuery } from "../holdings/queries";
import type { Instrument } from "../holdings/types";
import { useCreateWatchlistMutation } from "./queries";

interface WatchlistAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WatchlistAddDialog({ open, onOpenChange }: WatchlistAddDialogProps) {
  const createMutation = useCreateWatchlistMutation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);
  const [note, setNote] = useState("");
  const search = useInstrumentSearchQuery(debouncedQuery);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebouncedQuery("");
    setSelectedInstrument(null);
    setNote("");
    createMutation.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(selectedInstrument ? "" : query.trim());
    }, 260);
    return () => window.clearTimeout(timer);
  }, [query, selectedInstrument]);

  const submit = async () => {
    if (!selectedInstrument) return;
    try {
      await createMutation.mutateAsync({
        thscode: selectedInstrument.thscode,
        note: note.trim() || null,
      });
      onOpenChange(false);
    } catch {
      // Keep the dialog open so the user can see the error and retry.
    }
  };

  const errorMessage =
    createMutation.error instanceof ApiError
      ? createMutation.error.message
      : createMutation.error
        ? "添加失败，请稍后重试"
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(640px,calc(100vw-48px))]">
        <DialogHeader className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Star size={18} />
          </div>
          <div className="min-w-0 pt-0.5">
            <DialogTitle>添加自选</DialogTitle>
            <DialogDescription>
              搜索 A 股或 ETF，选择明确的标的后加入你的观察列表。
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-6">
          <label className="relative block">
            <span className="mb-2 block text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground">
              股票 / ETF
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" size={16} />
              <Input
                autoFocus
                value={selectedInstrument ? `${selectedInstrument.ticker} · ${selectedInstrument.name}` : query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedInstrument(null);
                }}
                placeholder="输入股票名称或代码"
                className="pl-10"
              />
              {selectedInstrument && (
                <button
                  type="button"
                  aria-label="清除已选择标的"
                  className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  onClick={() => {
                    setSelectedInstrument(null);
                    setQuery("");
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {debouncedQuery && !selectedInstrument && (
              <div className="absolute inset-x-0 top-[4.6rem] z-20 overflow-hidden rounded-xl border border-border bg-card shadow-dialog">
                {search.isLoading && (
                  <div className="flex items-center gap-2 px-4 py-4 text-[0.85rem] text-muted-foreground">
                    <LoaderCircle className="animate-spin" size={15} /> 正在搜索候选标的…
                  </div>
                )}
                {search.isError && (
                  <div className="px-4 py-4 text-[0.85rem] text-danger">
                    {search.error instanceof ApiError ? search.error.message : "搜索失败，请稍后重试"}
                  </div>
                )}
                {!search.isLoading && !search.isError && search.data?.items.length === 0 && (
                  <div className="px-4 py-4 text-[0.85rem] text-muted-foreground">未找到匹配的 A 股或 ETF。</div>
                )}
                {search.data?.items.map((item) => (
                  <button
                    key={item.thscode}
                    type="button"
                    className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left transition last:border-b-0 hover:bg-secondary/60"
                    onClick={() => {
                      setSelectedInstrument(item);
                      setQuery("");
                    }}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Star size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.92rem] font-semibold text-foreground">{item.name}</span>
                      <span className="mt-0.5 block font-mono text-[0.7rem] tracking-[0.04em] text-muted-foreground/65">{item.thscode}</span>
                    </span>
                    <Badge>{item.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>
                  </button>
                ))}
              </div>
            )}
          </label>

          {selectedInstrument && (
            <div className="flex items-center gap-2.5 rounded-xl border border-success/20 bg-success/8 px-4 py-3 text-[0.85rem] text-success">
              <Check size={15} />
              <span>已选择 {selectedInstrument.ticker} · {selectedInstrument.name}</span>
            </div>
          )}

          <label className="block">
            <span className="mb-2 flex items-center justify-between text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground">
              备注
              <span className="font-mono text-[0.7rem] font-normal tracking-normal text-muted-foreground/60">{note.length}/1000</span>
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 1000))}
              className="min-h-24 w-full resize-y rounded-lg border border-input bg-card px-3.5 py-3 text-[0.95rem] leading-7 text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-[3px] focus:ring-primary/15"
              placeholder="记录你的观察重点（可选）"
            />
          </label>

          {errorMessage && (
            <div role="alert" className="rounded-lg border-l-4 border-market-up bg-market-up/6 px-4 py-3 text-[0.9rem] text-danger">
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" className="!text-[12px]" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            取消
          </Button>
          <Button type="button" className="!text-[12px]" onClick={() => void submit()} disabled={!selectedInstrument || createMutation.isPending}>
            {createMutation.isPending && <LoaderCircle className="animate-spin" size={15} />}
            添加到自选
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
