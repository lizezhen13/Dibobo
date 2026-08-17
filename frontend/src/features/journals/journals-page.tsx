import { BookOpenText, CalendarDays, Edit3, NotebookPen, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { Skeleton } from "../../components/ui/skeleton";
import { formatDateTime } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import "./journals.css";
import { DateRangeField } from "../holdings/date-range-field";
import { JournalDialog } from "./journal-dialog";
import { useDeleteJournalMutation, useJournalsQuery } from "./queries";
import type { Journal } from "./types";

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJournal, setEditingJournal] = useState<Journal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Journal | null>(null);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const query = useJournalsQuery({ ...filters, page });
  const deleteMutation = useDeleteJournalMutation();
  const isFiltered = Boolean(filters.dateFrom || filters.dateTo);
  const selectedJournal = query.data?.items.find((journal) => journal.id === selectedJournalId) ?? query.data?.items[0] ?? null;

  const openEditor = (journal: Journal | null) => {
    setEditingJournal(journal);
    setDialogOpen(true);
  };

  const applyFilters = (dateFromInput: string, dateToInput: string) => {
    const next = new URLSearchParams(searchParamsString);
    if (dateFromInput) next.set("date_from", dateFromInput);
    else next.delete("date_from");
    if (dateToInput) next.set("date_to", dateToInput);
    else next.delete("date_to");
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
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
      if (deleteTarget.id === selectedJournalId) {
        const items = query.data?.items ?? [];
        const deletedIndex = items.findIndex((journal) => journal.id === deleteTarget.id);
        const nextJournal = items[deletedIndex + 1] ?? items[deletedIndex - 1] ?? null;
        setSelectedJournalId(nextJournal?.id ?? null);
      }
      if ((query.data?.items.length ?? 0) === 1 && page > 1) goToPage(page - 1);
      setDeleteTarget(null);
    } catch {
      // Keep the confirmation open so deletion can be retried.
    }
  };

  return (
    <PageContainer size="default" className="journals-page">
      <PageHeader
        eyebrow="INVESTMENT NOTES / 投资日记"
        title="投资日记"
        description="记录你每一次买入的逻辑，卖出的理由，每一笔交易背后，都是一次决策的印记。"
        className="shrink-0"
        actions={
          <Button onClick={() => openEditor(null)}>
            <Plus size={15} /> 新建日记
          </Button>
        }
      />

      {query.isPending ? (
        <div className="journal-workspace-shell">
          <JournalListSkeleton />
        </div>
      ) : query.isError ? (
        <div className="journal-state-shell">
          <ErrorState
            title="投资日记加载失败"
            description="请检查本地服务状态后重试。"
            retryLabel="重新加载"
            onRetry={() => void query.refetch()}
            className="min-h-[360px]"
          />
        </div>
      ) : query.data.items.length === 0 ? (
        <div className="journal-state-shell">
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
        </div>
      ) : (
        <div className={cn("journal-workspace-shell relative", query.isPlaceholderData && "opacity-55 transition-opacity")}>
          <JournalReadingWorkspace
            journals={query.data.items}
            selectedJournal={selectedJournal}
            page={query.data.page}
            pageSize={query.data.page_size}
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            isFiltered={isFiltered}
            onSelect={setSelectedJournalId}
            onEdit={openEditor}
            onDelete={setDeleteTarget}
            onApply={applyFilters}
            onClear={clearFilters}
          />
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
          className="journal-pagination mt-4 shrink-0"
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
}: {
  dateFrom: string;
  dateTo: string;
  isFiltered: boolean;
  onApply: (dateFrom: string, dateTo: string) => void;
  onClear: () => void;
}) {
  const [dateFromInput, setDateFromInput] = useState(dateFrom);
  const [dateToInput, setDateToInput] = useState(dateTo);

  return (
    <div className="journal-index-filter">
      <div className="journal-index-filter-field">
        <DateRangeField
          openedFrom={dateFromInput}
          openedTo={dateToInput}
          showPopoverClear={false}
          onChange={(nextDateFrom, nextDateTo) => {
            setDateFromInput(nextDateFrom);
            setDateToInput(nextDateTo);
            if (nextDateFrom && nextDateTo) onApply(nextDateFrom, nextDateTo);
            else if (!nextDateFrom && !nextDateTo && isFiltered) onClear();
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="journal-index-filter-clear"
          onClick={onClear}
          disabled={!dateFromInput && !dateToInput && !isFiltered}
          aria-label="重置筛选条件"
          title="重置筛选条件"
        >
          <RotateCcw size={14} />
        </Button>
      </div>
    </div>
  );
}

function JournalReadingWorkspace({
  journals,
  selectedJournal,
  page,
  pageSize,
  dateFrom,
  dateTo,
  isFiltered,
  onSelect,
  onEdit,
  onDelete,
  onApply,
  onClear,
}: {
  journals: Journal[];
  selectedJournal: Journal | null;
  page: number;
  pageSize: number;
  dateFrom: string;
  dateTo: string;
  isFiltered: boolean;
  onSelect: (id: string) => void;
  onEdit: (journal: Journal) => void;
  onDelete: (journal: Journal) => void;
  onApply: (dateFrom: string, dateTo: string) => void;
  onClear: () => void;
}) {
  const selectedIndex = selectedJournal ? journals.findIndex((journal) => journal.id === selectedJournal.id) : -1;
  const selectedOrdinal = selectedIndex >= 0 ? (page - 1) * pageSize + selectedIndex + 1 : 0;

  return (
    <div className="journal-workspace">
      <aside className="journal-index" aria-label="日记列表">
        <div className="journal-index-header">
          <div>
            <p className="journal-index-kicker">RECENT NOTES</p>
            <h2 className="journal-index-title">日记列表</h2>
          </div>
          <span className="journal-index-count">{journals.length.toString().padStart(2, "0")}</span>
        </div>

        <JournalDateFilterControls
          key={`${dateFrom}\u0000${dateTo}`}
          dateFrom={dateFrom}
          dateTo={dateTo}
          isFiltered={isFiltered}
          onApply={onApply}
          onClear={onClear}
        />

        <div className="journal-index-list" role="listbox" aria-label="选择要阅读的日记">
          {journals.map((journal, index) => {
            const ordinal = (page - 1) * pageSize + index + 1;
            const isSelected = journal.id === selectedJournal?.id;

            return (
              <button
                key={journal.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={cn("journal-index-item", isSelected && "journal-index-item-selected")}
                onClick={() => onSelect(journal.id)}
              >
                <span className="journal-index-meta-row">
                  <span className="journal-index-date">{formatJournalDate(journal.journal_date)}</span>
                  <span className="journal-index-time">{formatJournalTime(journal.created_at)}</span>
                </span>
                <span className="journal-index-heading">{journal.title}</span>
                <span className="journal-index-submeta">
                  NOTE {ordinal.toString().padStart(3, "0")} · {journal.content.length.toLocaleString("zh-CN")} CHARACTERS
                </span>
              </button>
            );
          })}
        </div>

        <div className="journal-index-footer">
          <span>{journals.length} NOTES / CURRENT</span>
        </div>
      </aside>

      {selectedJournal ? (
        <article className="journal-reading-pane">
          <header className="journal-reading-toolbar">
            <div>
              <p className="journal-reading-kicker">NOTE {selectedOrdinal.toString().padStart(3, "0")} / FULL TEXT</p>
            </div>
            <div className="journal-reading-actions">
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                onClick={() => onEdit(selectedJournal)}
                aria-label={`编辑 ${selectedJournal.title}`}
                title="编辑"
              >
                <Edit3 size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => onDelete(selectedJournal)}
                aria-label={`删除 ${selectedJournal.title}`}
                title="删除"
              >
                <Trash2 size={15} />
              </Button>
            </div>
          </header>

          <div className="journal-reading-body">
            <p className="journal-reading-date">
              {formatJournalDate(selectedJournal.journal_date)} · {formatJournalTime(selectedJournal.created_at)}
            </p>
            <h2 className="journal-reading-title">{selectedJournal.title}</h2>
            <div className="journal-reading-rule" />
            <p className="journal-reading-copy">{selectedJournal.content}</p>
          </div>
        </article>
      ) : (
        <div className="journal-reading-empty">选择左侧一篇日记开始阅读。</div>
      )}
    </div>
  );
}

function JournalListSkeleton() {
  return (
    <div className="journal-workspace journal-workspace-skeleton">
      <aside className="journal-index">
        <div className="journal-index-header">
          <div>
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-3 h-5 w-24" />
          </div>
          <Skeleton className="h-6 w-7" />
        </div>
        <div className="journal-index-filter journal-index-filter-skeleton">
          <div className="journal-index-filter-field">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="size-8" />
          </div>
        </div>
        <div className="journal-index-list">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="journal-index-skeleton-item">
              <Skeleton className="h-2.5 w-32" />
              <Skeleton className="mt-3 h-4 w-4/5" />
              <Skeleton className="mt-3 h-2.5 w-3/5" />
            </div>
          ))}
        </div>
      </aside>
      <div className="journal-reading-pane journal-reading-pane-skeleton">
        <div className="journal-reading-toolbar">
          <div>
            <Skeleton className="h-2.5 w-36" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="size-9" />
            <Skeleton className="size-9" />
          </div>
        </div>
        <div className="journal-reading-body">
          <Skeleton className="h-2.5 w-52" />
          <Skeleton className="mt-4 h-9 w-4/5" />
          <div className="my-8 border-t border-line" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-4 h-4 w-11/12" />
          <Skeleton className="mt-4 h-4 w-4/5" />
        </div>
      </div>
    </div>
  );
}

function formatJournalDate(value: string): string {
  return value.replaceAll("-", ".");
}

function formatJournalTime(value: string): string {
  const formatted = formatDateTime(value);
  return formatted.split(" ").at(-1) ?? formatted;
}
