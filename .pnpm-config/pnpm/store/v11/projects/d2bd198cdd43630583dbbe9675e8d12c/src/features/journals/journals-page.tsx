import { BookOpenText, CalendarDays, ChevronDown, ChevronUp, Edit3, Filter, NotebookPen, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

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
import { EmptyState, ErrorState, PageContainer, PageHeader, Pagination } from "../../components/patterns";
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

export function JournalsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const appliedState = useMemo(() => {
    const params = new URLSearchParams(searchParamsString);
    const parsedPage = Number(params.get("page"));
    return {
      filters: {
        dateFrom: params.get("date_from") ?? "",
        dateTo: params.get("date_to") ?? "",
      },
      page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    };
  }, [searchParamsString]);
  const { filters, page } = appliedState;
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

  const applyFilters = (dateFromInput: string, dateToInput: string) => {
    if (dateFromInput && dateToInput && dateFromInput > dateToInput) {
      setFilterError("开始日期不能晚于结束日期");
      return;
    }
    setFilterError(null);
    const next = new URLSearchParams(searchParamsString);
    if (dateFromInput) next.set("date_from", dateFromInput);
    else next.delete("date_from");
    if (dateToInput) next.set("date_to", dateToInput);
    else next.delete("date_to");
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    setFilterError(null);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParamsString);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next, { replace: true });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      if ((query.data?.items.length ?? 0) === 1 && page > 1) goToPage(page - 1);
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
    <PageContainer size="default">
      <PageHeader
        eyebrow="INVESTMENT NOTES / 投资日记"
        title="投资日记"
        description="记录你每一次买入的逻辑，卖出的理由，每一笔交易背后，都是一次决策的印记。"
        actions={
          <Button onClick={() => openEditor(null)}>
            <Plus size={15} /> 新建日记
          </Button>
        }
      />

      <div className="mb-7 overflow-hidden rounded-xl border border-border bg-card shadow-raised">
        <JournalDateFilterControls
          key={`${filters.dateFrom}\u0000${filters.dateTo}`}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          isFiltered={isFiltered}
          onApply={applyFilters}
          onClear={clearFilters}
          onInputChange={() => setFilterError(null)}
        />
        <div className="flex h-9 items-center justify-between border-t border-line bg-card-deep/35 px-5 font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground/60">
          <span>{filterError ?? (isFiltered ? formatRange(filters) : "ALL DATES / 全部历史")}</span>
          <span>{query.data ? `${query.data.total} NOTES` : "— NOTES"}</span>
        </div>
      </div>

      {query.isPending ? (
        <JournalListSkeleton />
      ) : query.isError ? (
        <ErrorState
          title="投资日记加载失败"
          description="请检查本地服务状态后重试。"
          retryLabel="重新加载"
          onRetry={() => void query.refetch()}
          className="min-h-[360px]"
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={isFiltered ? CalendarDays : BookOpenText}
          title={isFiltered ? "该日期范围内没有投资日记" : "还没有留下任何投资日记"}
          description={
            isFiltered ? "换一个日期范围，或者回到全部历史记录。" : "第一篇不需要完美。记下今天最重要的判断，以及什么事实会证明它是错的。"
          }
          action={
            <>
              {isFiltered && (
                <Button variant="outline" onClick={clearFilters}>
                  <RotateCcw size={14} /> 查看全部
                </Button>
              )}
              <Button onClick={() => openEditor(null)}>
                <NotebookPen size={14} /> 写一篇日记
              </Button>
            </>
          }
          className="min-h-[390px]"
        />
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

      {query.data && (
        <Pagination
          page={query.data.page}
          totalPages={query.data.total_pages}
          pageStart={(query.data.page - 1) * query.data.page_size + 1}
          pageEnd={Math.min(query.data.page * query.data.page_size, query.data.total)}
          totalItems={query.data.total}
          isLoading={query.isFetching}
          onPageChange={goToPage}
          className="mt-7"
        />
      )}

      <JournalDialog open={dialogOpen} onOpenChange={setDialogOpen} journal={editingJournal} />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除“{deleteTarget?.title}”？</AlertDialogTitle>
            <AlertDialogDescription>这篇日记及其正文会被立即删除，且没有回收站或版本历史。该操作无法撤销。</AlertDialogDescription>
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
    </PageContainer>
  );
}

function JournalDateFilterControls({
  dateFrom,
  dateTo,
  isFiltered,
  onApply,
  onClear,
  onInputChange,
}: {
  dateFrom: string;
  dateTo: string;
  isFiltered: boolean;
  onApply: (dateFrom: string, dateTo: string) => void;
  onClear: () => void;
  onInputChange: () => void;
}) {
  const [dateFromInput, setDateFromInput] = useState(dateFrom);
  const [dateToInput, setDateToInput] = useState(dateTo);

  return (
    <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
      <div className="flex h-10 items-center gap-2 pr-2 text-label font-semibold tracking-[0.08em] text-muted-foreground">
        <CalendarDays size={16} className="text-primary/80" /> 日期范围
      </div>
      <label className="relative block">
        <div className="relative">
          <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-primary/80" />
          <span
            className={cn(
              "pointer-events-none absolute left-9 top-1/2 z-10 -translate-y-1/2 text-body-sm text-muted-foreground/45",
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
              onInputChange();
            }}
          />
        </div>
      </label>
      <label className="relative block">
        <div className="relative">
          <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-primary/80" />
          <span
            className={cn(
              "pointer-events-none absolute left-9 top-1/2 z-10 -translate-y-1/2 text-body-sm text-muted-foreground/45",
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
              onInputChange();
            }}
          />
        </div>
      </label>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onClear} disabled={!dateFromInput && !dateToInput && !isFiltered}>
          <RotateCcw size={14} /> 清除
        </Button>
        <Button onClick={() => onApply(dateFromInput, dateToInput)}>
          <Filter size={14} /> 筛选
        </Button>
      </div>
    </div>
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

function getDateParts(value: string) {
  const [year, month, day] = value.split("-");
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${value}T00:00:00+08:00`)).toUpperCase();
  return { year, month: monthLabel || month, day };
}

function formatRange(filters: AppliedFilters): string {
  if (filters.dateFrom && filters.dateTo) return `${filters.dateFrom} — ${filters.dateTo}`;
  if (filters.dateFrom) return `FROM ${filters.dateFrom}`;
  return `THROUGH ${filters.dateTo}`;
}
