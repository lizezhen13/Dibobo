import { flexRender, getCoreRowModel, type ColumnDef, type RowData, useReactTable } from "@tanstack/react-table";
import { useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "../lib/utils";
import { RecordCard } from "./patterns/record-card";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "./ui/table";

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
  toolbar?: ReactNode;
  toolbarClassName?: string;
  tableClassName?: string;
  headerClassName?: string;
  pagination?: ReactNode;
  appearance?: "card" | "embedded";
  mobile?: { titleColumn: string; primaryColumns: string[]; actionColumn?: string };
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
  toolbar,
  toolbarClassName,
  tableClassName,
  headerClassName,
  pagination,
  appearance = "card",
  mobile,
  rowReorder,
}: DataTableProps<TData>) {
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");

  const rowReorderEnabled = rowReorder?.enabled ?? false;

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
    <TableFrame appearance={appearance} className={cn(stickyHeader && "flex-1", className)}>
      {toolbar ? <div className={cn("shrink-0 border-b border-border bg-card px-5 py-4 sm:px-6", toolbarClassName)}>{toolbar}</div> : null}
      <div className={cn("workspace-table-scroll", stickyHeader && "flex-1", mobile && "hidden md:block")}>
        <Table className={cn(tableClassName)} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}>
          <TableHeader className={cn(stickyHeader && "sticky top-0 z-20", headerClassName)}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  return (
                    <TableHead
                      key={header.id}
                      density={meta?.density}
                      aria-sort={meta?.sortDirection}
                      className={cn(
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
                    </TableHead>
                  );
                })}
              </tr>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 4 }, (_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`}>
                    {columns.map((_, columnIndex) => (
                      <TableCell key={columnIndex}>
                        <div
                          className="h-3.5 animate-pulse rounded-full bg-secondary"
                          style={{ width: `${44 + ((rowIndex + columnIndex) % 4) * 13}%` }}
                        />
                      </TableCell>
                    ))}
                  </tr>
                ))
              : rows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    draggable={rowReorderEnabled}
                    onDragStart={(event) => handleDragStart(event, row.id)}
                    onDragOver={(event) => handleDragOver(event, row.id)}
                    onDrop={(event) => handleDrop(event, row.id)}
                    onDragEnd={handleDragEnd}
                    tabIndex={rowReorderEnabled ? 0 : undefined}
                    aria-roledescription={rowReorderEnabled ? "可排序行" : undefined}
                    onKeyDown={(event) => {
                      if (!rowReorderEnabled || event.target !== event.currentTarget) return;
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        handleKeyboardReorder(row.id, index, -1);
                      } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        handleKeyboardReorder(row.id, index, 1);
                      }
                    }}
                    className={cn(
                      index % 2 === 1 && "bg-row-stripe",
                      rowReorderEnabled && "cursor-grab active:cursor-grabbing",
                      draggingRowId === row.id && "opacity-50",
                      dragOverRowId === row.id && draggingRowId !== row.id && "bg-primary/[0.08]",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <TableCell
                          key={cell.id}
                          density={meta?.density}
                          className={cn(
                            meta?.sticky === "left" && "sticky left-0 z-10 bg-card group-hover:bg-secondary",
                            meta?.sticky === "right" && "sticky right-0 z-10 bg-card group-hover:bg-secondary",
                            meta?.align === "right" && "text-right font-mono tabular-nums",
                            meta?.align === "center" && "text-center",
                            meta?.cellClassName,
                            centered && "text-center",
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      {mobile && (
        <div className="md:hidden" aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}>
          {isLoading ? (
            <div className="p-6 text-body text-muted-foreground" role="status">
              正在加载记录…
            </div>
          ) : (
            rows.map((row, index) => {
              const cells = row.getVisibleCells();
              const renderCell = (id: string) => {
                const cell = cells.find((candidate) => candidate.column.id === id);
                return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null;
              };
              const fields = cells
                .filter((cell) => cell.column.id !== mobile.titleColumn && cell.column.id !== (mobile.actionColumn ?? "actions"))
                .map((cell) => {
                  const header = table.getFlatHeaders().find((candidate) => candidate.column.id === cell.column.id);
                  return {
                    id: cell.column.id,
                    label: header ? flexRender(header.column.columnDef.header, header.getContext()) : cell.column.id,
                    value: flexRender(cell.column.columnDef.cell, cell.getContext()),
                  };
                });
              return (
                <RecordCard
                  key={row.id}
                  title={renderCell(mobile.titleColumn)}
                  fields={fields.filter((field) => mobile.primaryColumns.includes(field.id))}
                  details={fields.filter((field) => !mobile.primaryColumns.includes(field.id))}
                  actions={
                    <>
                      {rowReorderEnabled && (
                        <div className="mr-auto flex gap-1">
                          <Button
                            size="icon-sm"
                            variant="outline"
                            disabled={index === 0}
                            aria-label={`上移第 ${index + 1} 条`}
                            onClick={() => handleKeyboardReorder(row.id, index, -1)}
                          >
                            <ArrowUp size={16} />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="outline"
                            disabled={index === rows.length - 1}
                            aria-label={`下移第 ${index + 1} 条`}
                            onClick={() => handleKeyboardReorder(row.id, index, 1)}
                          >
                            <ArrowDown size={16} />
                          </Button>
                        </div>
                      )}
                      {renderCell(mobile.actionColumn ?? "actions")}
                    </>
                  }
                />
              );
            })
          )}
        </div>
      )}
      {rowReorderEnabled ? (
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {reorderAnnouncement}
        </div>
      ) : null}
      {!isLoading && data.length === 0 && <div className="border-t border-border/60">{empty}</div>}
      {pagination}
    </TableFrame>
  );
}
