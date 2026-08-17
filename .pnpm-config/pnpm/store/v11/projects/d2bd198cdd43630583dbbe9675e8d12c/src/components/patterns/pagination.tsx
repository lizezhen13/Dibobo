import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageStart?: number;
  pageEnd?: number;
  totalItems?: number;
  isLoading?: boolean;
  className?: string;
  summary?: ReactNode;
  compact?: boolean;
  alwaysVisible?: boolean;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageStart,
  pageEnd,
  totalItems,
  isLoading = false,
  className,
  summary: summaryContent,
  compact = false,
  alwaysVisible = false,
}: PaginationProps) {
  if (totalPages <= 1 && !alwaysVisible) return null;

  const summary =
    pageStart !== undefined && pageEnd !== undefined && totalItems !== undefined
      ? `显示 ${pageStart}-${pageEnd} / ${totalItems}`
      : `第 ${page} 页 / 共 ${totalPages} 页`;

  return (
    <nav
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border",
        compact ? "gap-2 bg-secondary/15 px-4 py-1.5" : "pt-5",
        className,
      )}
      aria-label="分页"
    >
      <p className="font-mono text-caption tracking-[0.08em] text-muted-foreground/60">{summaryContent ?? summary}</p>
      <div className={cn("flex items-center", compact ? "gap-1.5" : "gap-2")}>
        <Button
          variant="outline"
          size={compact ? "xs" : "sm"}
          disabled={page <= 1 || isLoading}
          onClick={() => onPageChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeft size={14} /> 上一页
        </Button>
        <span className={cn("text-center text-muted-foreground", compact ? "min-w-16 text-xs" : "min-w-20 text-sm")} aria-current="page">
          第 {page} 页
        </span>
        <Button
          variant="outline"
          size={compact ? "xs" : "sm"}
          disabled={page >= totalPages || isLoading}
          onClick={() => onPageChange(page + 1)}
          aria-label="下一页"
        >
          下一页 <ChevronRight size={14} />
        </Button>
      </div>
    </nav>
  );
}
