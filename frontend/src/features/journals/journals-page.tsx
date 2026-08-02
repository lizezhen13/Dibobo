import {
  AlertTriangle,
  BookOpenText,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Edit3,
  Filter,
  NotebookPen,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { formatDateTime } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import { JournalDialog } from "./journal-dialog";
import { useDeleteJournalMutation, useJournalsQuery } from "./queries";
import type { Journal } from "./types";

interface AppliedFilters {
  dateFrom: string;
  dateTo: string;
}

const emptyFilters: AppliedFilters = { dateFrom: "", dateTo: "" };

export function JournalsPage() {
  const [dateFromInput, setDateFromInput] = useState("");
  const [dateToInput, setDateToInput] = useState("");
  const [filters, setFilters] = useState<AppliedFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJournal, setEditingJournal] = useState<Journal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Journal | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const query = useJournalsQuery({ ...filters, page });
  const deleteMutation = useDeleteJournalMutation();
  const isFiltered = Boolean(filters.dateFrom || filters.dateTo);

  const openEditor = (journal: Journal | null) => {
    setEditingJournal(journal);
    setDialogOpen(true);
  };

  const applyFilters = () => {
    if (dateFromInput && dateToInput && dateFromInput > dateToInput) {
      setFilterError("开始日期不能晚于结束日期");
      return;
    }
    setFilterError(null);
    setFilters({ dateFrom: dateFromInput, dateTo: dateToInput });
    setPage(1);
  };

  const clearFilters = () => {
    setDateFromInput("");
    setDateToInput("");
    setFilters(emptyFilters);
    setFilterError(null);
    setPage(1);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      if ((query.data?.items.length ?? 0) === 1 && page > 1) setPage((value) => value - 1);
      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
    } catch {
      // Keep the confirmation open so deletion can be retried.
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="mx-auto w-full max-w-[1280px] animate-enter">
      <div className="mb-8 flex items-end justify-between gap-8">
        <div>
          <p className="eyebrow text-primary/90">INVESTMENT NOTES / 投资日记</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-foreground">投资日记</h1>
          <p className="mt-2.5 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
            记录你每一次买入的逻辑，卖出的理由，每一笔交易背后，都是一次决策的印记。
          </p>
        </div>
        <Button onClick={() => openEditor(null)}>
          <Plus size={15} /> 新建日记
        </Button>
      </div>

      <div className="mb-7 overflow-hidden rounded-xl border border-border bg-card shadow-raised">
        <div className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-4 px-5 py-5">
          <div className="flex h-10 items-center gap-2 pr-2 text-[0.78rem] font-semibold tracking-[0.08em] text-muted-foreground">
            <CalendarDays size={16} className="text-primary/80" /> 日期范围
          </div>
          <label className="relative block">
            <div className="relative">
              <CalendarDays
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-primary/80"
              />
              <span
                className={cn(
                  "pointer-events-none absolute left-9 top-1/2 z-10 -translate-y-1/2 text-[0.9rem] text-muted-foreground/45",
                  dateFromInput && "hidden",
                )}
              >
                请选择开始日期
              </span>
              <Input
                type="date"
                value={dateFromInput}
                className={cn("date-input w-full cursor-pointer pl-9", !dateFromInput && "date-input-empty")}
                onChange={(event) => {
                  setDateFromInput(event.target.value);
                  setFilterError(null);
                }}
              />
            </div>
          </label>
          <label className="relative block">
            <div className="relative">
              <CalendarDays
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-primary/80"
              />
              <span
                className={cn(
                  "pointer-events-none absolute left-9 top-1/2 z-10 -translate-y-1/2 text-[0.9rem] text-muted-foreground/45",
                  dateToInput && "hidden",
                )}
              >
                请选择结束日期
              </span>
              <Input
                type="date"
                value={dateToInput}
                className={cn("date-input w-full cursor-pointer pl-9", !dateToInput && "date-input-empty")}
                onChange={(event) => {
                  setDateToInput(event.target.value);
                  setFilterError(null);
                }}
              />
            </div>
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={clearFilters} disabled={!dateFromInput && !dateToInput && !isFiltered}>
              <RotateCcw size={14} /> 清除
            </Button>
            <Button onClick={applyFilters}>
              <Filter size={14} /> 筛选
            </Button>
          </div>
        </div>
        <div className="flex h-9 items-center justify-between border-t border-line bg-card-deep/35 px-5 font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground/60">
          <span>{filterError ?? (isFiltered ? formatRange(filters) : "ALL DATES / 全部历史")}</span>
          <span>{query.data ? `${query.data.total} NOTES` : "— NOTES"}</span>
        </div>
      </div>

      {query.isPending ? (
        <JournalListSkeleton />
      ) : query.isError ? (
        <LoadError onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState filtered={isFiltered} onCreate={() => openEditor(null)} onClear={clearFilters} />
      ) : (
        <div className={cn("relative", query.isPlaceholderData && "opacity-55 transition-opacity")}>
          <div className="space-y-5">
            {query.data.items.map((journal, index) => (
              <JournalEntry
                key={journal.id}
                journal={journal}
                ordinal={(query.data.page - 1) * query.data.page_size + index + 1}
                isFirst={index === 0}
                isLast={index === query.data.items.length - 1}
                expanded={expandedIds.has(journal.id)}
                onToggle={() => toggleExpanded(journal.id)}
                onEdit={() => openEditor(journal)}
                onDelete={() => setDeleteTarget(journal)}
              />
            ))}
          </div>
        </div>
      )}

      {query.data && query.data.total_pages > 1 && (
        <div className="mt-7 flex items-center justify-between border-t border-border pt-5">
          <p className="font-mono text-[0.7rem] tracking-[0.08em] text-muted-foreground/60">
            PAGE {query.data.page.toString().padStart(2, "0")} / {query.data.total_pages.toString().padStart(2, "0")}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setPage((value) => value - 1)}>
              <ChevronLeft size={14} /> 上一页
            </Button>
            <span className="min-w-20 text-center text-[0.85rem] text-muted-foreground">
              第 {query.data.page} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= query.data.total_pages || query.isFetching}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页 <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      <JournalDialog open={dialogOpen} onOpenChange={setDialogOpen} journal={editingJournal} />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除“{deleteTarget?.title}”？</AlertDialogTitle>
            <AlertDialogDescription>
              这篇日记及其正文会被立即删除，且没有回收站或版本历史。该操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.error && (
            <div role="alert" className="mt-4 border-l-2 border-market-up bg-danger/10 px-4 py-3 text-sm text-market-up">
              删除失败，请稍后重试
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              确认永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function JournalEntry({
  journal,
  ordinal,
  isFirst,
  isLast,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  journal: Journal;
  ordinal: number;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const dateParts = getDateParts(journal.journal_date);
  const contentIsLong = journal.content.length > 240 || journal.content.split("\n").length > 4;
  const wasEdited = new Date(journal.updated_at).getTime() - new Date(journal.created_at).getTime() > 1000;
  const showTimeline = !(isFirst && isLast);

  return (
    <div className="relative grid grid-cols-[116px_minmax(0,1fr)] gap-5">
      <div className="relative z-[1] flex items-center justify-center text-center">
        {showTimeline && (
          <div
            className={cn(
              "absolute left-1/2 w-px -translate-x-1/2 bg-border/60",
              isFirst && !isLast && "top-1/2 -bottom-2.5",
              !isFirst && !isLast && "-top-2.5 -bottom-2.5",
              !isFirst && isLast && "-top-2.5 bottom-1/2",
            )}
            aria-hidden="true"
          />
        )}
        <div className="relative z-10 mx-auto w-[74px] rounded-xl border border-border bg-background px-2 py-3 shadow-subtle">
          <p className="font-display text-[1.75rem] leading-none text-foreground">{dateParts.day}</p>
          <p className="mt-1.5 font-mono text-[0.58rem] tracking-[0.12em] text-primary/80">{dateParts.month}</p>
          <p className="mt-0.5 font-mono text-[0.58rem] text-muted-foreground/50">{dateParts.year}</p>
        </div>
      </div>

      <article className="group overflow-hidden rounded-xl border border-border bg-card shadow-raised transition duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-dialog">
        <div className="flex items-start gap-5 border-b border-line px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2 font-mono text-[0.62rem] tracking-[0.12em] text-muted-foreground/55">
              <span className="text-primary/80">NOTE {ordinal.toString().padStart(3, "0")}</span>
              <span>·</span>
              <span>{formatDateTime(journal.created_at)}</span>
              {wasEdited && <span className="rounded-full bg-secondary px-2 py-0.5 tracking-normal">已修改</span>}
            </div>
            <h2 className="font-display text-[1.5rem] tracking-tight text-foreground">{journal.title}</h2>
          </div>
          <div className="flex shrink-0 gap-1 opacity-60 transition group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="size-9" onClick={onEdit} aria-label={`编辑 ${journal.title}`} title="编辑">
              <Edit3 size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-danger hover:bg-danger/10 hover:text-danger"
              onClick={onDelete}
              aria-label={`删除 ${journal.title}`}
              title="删除"
            >
              <Trash2 size={15} />
            </Button>
          </div>
        </div>

        <div
          className="relative px-6 py-5"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, color-mix(in oklch, var(--line) 48%, transparent) 32px)",
          }}
        >
          <p
            className={cn(
              "whitespace-pre-wrap break-words text-[0.94rem] leading-8 text-muted-foreground",
              !expanded && contentIsLong && "line-clamp-4",
            )}
          >
            {journal.content}
          </p>
          {!expanded && contentIsLong && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
          )}
        </div>

        <div className="flex h-11 items-center justify-between border-t border-line bg-card-deep/25 px-6">
          <span className="font-mono text-[0.62rem] tracking-[0.1em] text-muted-foreground/45">
            {journal.content.length.toLocaleString("zh-CN")} CHARACTERS
            {wasEdited && ` · EDITED ${formatDateTime(journal.updated_at)}`}
          </span>
          {contentIsLong && (
            <button
              type="button"
              className="relative z-[1] inline-flex items-center gap-1.5 text-[0.78rem] font-semibold text-primary transition hover:text-primary-hover"
              onClick={onToggle}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? "收起正文" : "展开全文"}
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

function JournalListSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[116px_minmax(0,1fr)] gap-5">
          <div className="flex items-center justify-center">
            <Skeleton className="h-[84px] w-[74px] rounded-xl" />
          </div>
          <div className="rounded-xl border border-border bg-card px-6 py-6 shadow-raised">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="mt-3 h-7 w-2/5" />
            <Skeleton className="mt-8 h-4 w-full" />
            <Skeleton className="mt-3 h-4 w-5/6" />
            <Skeleton className="mt-3 h-4 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  filtered,
  onCreate,
  onClear,
}: {
  filtered: boolean;
  onCreate: () => void;
  onClear: () => void;
}) {
  return (
    <div className="grid min-h-[390px] place-items-center rounded-xl border border-dashed border-border bg-card/35 px-6 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-full border border-primary/20 bg-primary/6 text-primary/80">
          {filtered ? <CalendarDays size={23} /> : <BookOpenText size={23} />}
        </span>
        <p className="mt-5 eyebrow text-primary/70">{filtered ? "NO NOTES IN RANGE" : "YOUR FIRST NOTE"}</p>
        <h2 className="mt-2 font-display text-2xl tracking-tight text-foreground">
          {filtered ? "该日期范围内没有投资日记" : "还没有留下任何投资日记"}
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-[0.9rem] leading-7 text-muted-foreground">
          {filtered
            ? "换一个日期范围，或者回到全部历史记录。"
            : "第一篇不需要完美。记下今天最重要的判断，以及什么事实会证明它是错的。"}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {filtered && (
            <Button variant="outline" onClick={onClear}>
              <RotateCcw size={14} /> 查看全部
            </Button>
          )}
          <Button onClick={onCreate}>
            <NotebookPen size={14} /> 写一篇日记
          </Button>
        </div>
      </div>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-[360px] place-items-center rounded-xl border border-border bg-card text-center shadow-raised">
      <div>
        <AlertTriangle className="mx-auto text-market-up" size={24} />
        <h2 className="mt-4 font-display text-2xl tracking-tight text-foreground">投资日记加载失败</h2>
        <p className="mt-2 text-[0.9rem] text-muted-foreground">请检查本地服务状态后重试。</p>
        <Button className="mt-5" variant="outline" onClick={onRetry}>
          <RefreshCw size={14} /> 重新加载
        </Button>
      </div>
    </div>
  );
}

function getDateParts(value: string) {
  const [year, month, day] = value.split("-");
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short" })
    .format(new Date(`${value}T00:00:00+08:00`))
    .toUpperCase();
  return { year, month: monthLabel || month, day };
}

function formatRange(filters: AppliedFilters): string {
  if (filters.dateFrom && filters.dateTo) return `${filters.dateFrom} — ${filters.dateTo}`;
  if (filters.dateFrom) return `FROM ${filters.dateFrom}`;
  return `THROUGH ${filters.dateTo}`;
}
