import { flexRender, getCoreRowModel, type ColumnDef, type RowData, useReactTable } from "@tanstack/react-table";
import { useState, type DragEvent, type ReactNode } from "react";

import { cn } from "../lib/utils";

declare module "@tanstack/react-table" {
  // TanStack requires these generic parameters for declaration merging even though
  // this metadata extension does not read them directly.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "left" | "center" | "right";
    density?: "compact" | "default";
    sticky?: "left" | "right";
    sortDirection?: "ascending" | "descending" | "none";
    cellClassName?: string;
    headerClassName?: string;
  }
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  empty: ReactNode;
  isLoading?: boolean;
  getRowId?: (row: TData) => string;
  className?: string;
  stickyHeader?: boolean;
  centered?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  pagination?: ReactNode;
  rowReorder?: {
    enabled: boolean;
    onReorder: (activeId: string, overId: string) => void | Promise<void>;
  };
}

export function DataTable<TData>({
  columns,
  data,
  empty,
  isLoading = false,
  getRowId,
  className,
  stickyHeader = false,
  centered = false,
  ariaLabel,
  ariaLabelledBy,
  pagination,
  rowReorder,
}: DataTableProps<TData>) {
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");

  const rowReorderEnabled = rowReorder?.enabled ?? false;
  const hasPagination = pagination !== undefined && pagination !== null;

  function handleDragStart(event: DragEvent<HTMLTableRowElement>, rowId: string) {
    if (!rowReorderEnabled) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,a,input,select,textarea")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", rowId);
    setDraggingRowId(rowId);
  }

  function handleDragOver(event: DragEvent<HTMLTableRowElement>, rowId: string) {
    if (!rowReorderEnabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverRowId(rowId);
  }

  function handleDrop(event: DragEvent<HTMLTableRowElement>, rowId: string) {
    if (!rowReorderEnabled) return;
    event.preventDefault();
    const activeId = event.dataTransfer.getData("text/plain");
    if (activeId && activeId !== rowId) {
      void rowReorder?.onReorder(activeId, rowId);
    }
    setDraggingRowId(null);
    setDragOverRowId(null);
  }

  function handleDragEnd() {
    setDraggingRowId(null);
    setDragOverRowId(null);
  }

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });
  const rows = table.getRowModel().rows;

  function handleKeyboardReorder(rowId: string, rowIndex: number, direction: -1 | 1) {
    if (!rowReorderEnabled) return;
    const targetRow = rows[rowIndex + direction];
    if (!targetRow) {
      setReorderAnnouncement(direction < 0 ? "已经是第一行" : "已经是最后一行");
      return;
    }
    setReorderAnnouncement(`正在将第 ${rowIndex + 1} 行移动到第 ${rowIndex + direction + 1} 行`);
    void Promise.resolve(rowReorder?.onReorder(rowId, targetRow.id)).then(
      () => setReorderAnnouncement(`已移动到第 ${rowIndex + direction + 1} 行`),
      () => setReorderAnnouncement("排序失败，请稍后重试"),
    );
  }

  return (
    <div
      className={cn(
        stickyHeader
          ? hasPagination
            ? "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-raised"
            : "h-full overflow-auto rounded-xl border border-border bg-card shadow-raised"
          : "overflow-hidden rounded-xl border border-border bg-card shadow-raised",
        className,
      )}
    >
      <div className={cn(stickyHeader ? (hasPagination ? "min-h-0 flex-1 overflow-auto" : "overflow-visible") : "overflow-x-auto")}>
        <table
          className={cn("w-full min-w-max border-collapse text-left text-[13px]", stickyHeader && "border-separate border-spacing-0")}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
        >
          <thead className={cn("border-b border-border bg-secondary/60", stickyHeader && "!sticky !top-0 !z-20 !bg-secondary")}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  return (
                    <th
                      key={header.id}
                      aria-sort={meta?.sortDirection}
                      className={cn(
                        meta?.density === "compact" ? "h-10 px-4 py-2" : "h-11 px-5 py-3",
                        "whitespace-nowrap align-middle text-[13px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
                        stickyHeader && "sticky top-0 z-20 bg-secondary",
                        meta?.sticky === "left" && "sticky left-0 z-30 bg-secondary",
                        meta?.sticky === "right" && "sticky right-0 z-30 bg-secondary",
                        meta?.align === "right" && "text-right",
                        meta?.align === "center" && "text-center",
                        meta?.headerClassName,
                        centered && "text-center",
                      )}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading
              ? Array.from({ length: 4 }, (_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`}>
                    {columns.map((_, columnIndex) => (
                      <td key={columnIndex} className="h-[4.25rem] px-5">
                        <div
                          className="h-3.5 animate-pulse rounded-full bg-secondary"
                          style={{ width: `${44 + ((rowIndex + columnIndex) % 4) * 13}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row, index) => (
                  <tr
                    key={row.id}
                    draggable={rowReorderEnabled}
                    onDragStart={(event) => handleDragStart(event, row.id)}
                    onDragOver={(event) => handleDragOver(event, row.id)}
                    onDrop={(event) => handleDrop(event, row.id)}
                    onDragEnd={handleDragEnd}
                    tabIndex={rowReorderEnabled ? 0 : undefined}
                    aria-roledescription={rowReorderEnabled ? "可排序行" : undefined}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        handleKeyboardReorder(row.id, index, -1);
                      } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        handleKeyboardReorder(row.id, index, 1);
                      }
                    }}
                    className={cn(
                      "group transition-colors duration-150 hover:bg-row-hover",
                      index % 2 === 1 && "bg-row-stripe",
                      rowReorderEnabled && "cursor-grab active:cursor-grabbing",
                      draggingRowId === row.id && "opacity-50",
                      dragOverRowId === row.id && draggingRowId !== row.id && "bg-primary/[0.08]",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            meta?.density === "compact" ? "h-12 px-4" : "h-[4.25rem] px-5",
                            "whitespace-nowrap align-middle text-[13px] text-foreground/85",
                            meta?.sticky === "left" && "sticky left-0 z-10 bg-card group-hover:bg-secondary",
                            meta?.sticky === "right" && "sticky right-0 z-10 bg-card group-hover:bg-secondary",
                            meta?.align === "right" && "text-right font-mono tabular-nums",
                            meta?.align === "center" && "text-center",
                            meta?.cellClassName,
                            centered && "text-center",
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {rowReorderEnabled ? (
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {reorderAnnouncement}
        </div>
      ) : null}
      {!isLoading && data.length === 0 && <div className="border-t border-border/60">{empty}</div>}
      {pagination}
    </div>
  );
}
