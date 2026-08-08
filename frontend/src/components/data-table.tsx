import {
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  useReactTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends unknown, TValue> {
    align?: "left" | "center" | "right";
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
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  return (
    <div
      className={cn(
        stickyHeader
          ? "h-full overflow-auto rounded-xl border border-border bg-card shadow-raised"
          : "overflow-hidden rounded-xl border border-border bg-card shadow-raised",
        className,
      )}
    >
      <div className={stickyHeader ? "overflow-visible" : "overflow-x-auto"}>
        <table className={cn("w-full min-w-max border-collapse text-left text-sm", stickyHeader && "border-separate border-spacing-0")}>
          <thead className={cn("border-b border-border bg-secondary/60", stickyHeader && "!sticky !top-0 !z-20 !bg-secondary")}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "h-11 whitespace-nowrap px-5 py-3 align-middle text-[13px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
                        stickyHeader && "!sticky !top-0 !z-20 !bg-secondary",
                        meta?.align === "right" && "text-right",
                        meta?.align === "center" && "text-center",
                        meta?.headerClassName,
                        centered && "!text-center",
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
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
              : table.getRowModel().rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "group transition-colors duration-150 hover:bg-row-hover",
                      index % 2 === 1 && "bg-row-stripe",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "h-[4.25rem] whitespace-nowrap px-5 align-middle text-foreground/85",
                            meta?.align === "right" && "text-right font-mono tabular-nums",
                            meta?.align === "center" && "text-center",
                            meta?.cellClassName,
                            centered && "!text-center",
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
      {!isLoading && data.length === 0 && <div className="border-t border-border/60">{empty}</div>}
    </div>
  );
}
