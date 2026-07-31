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
}

export function DataTable<TData>({
  columns,
  data,
  empty,
  isLoading = false,
  getRowId,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-left text-xs">
          <thead className="border-b border-border bg-secondary/60">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "h-10 whitespace-nowrap px-4 font-mono text-[10px] font-medium uppercase tracking-[.12em] text-muted-foreground",
                        meta?.align === "right" && "text-right",
                        meta?.align === "center" && "text-center",
                        meta?.headerClassName,
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
          <tbody className="divide-y divide-border/70">
            {isLoading
              ? Array.from({ length: 4 }, (_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`}>
                    {columns.map((_, columnIndex) => (
                      <td key={columnIndex} className="h-16 px-4">
                        <div
                          className="h-3 animate-pulse rounded-full bg-secondary"
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
                      "group transition-colors hover:bg-row-hover",
                      index % 2 === 1 && "bg-row-stripe",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "h-16 whitespace-nowrap px-4 align-middle text-foreground/80",
                            meta?.align === "right" && "text-right font-mono tabular-nums",
                            meta?.align === "center" && "text-center",
                            meta?.cellClassName,
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
      {!isLoading && data.length === 0 && empty}
    </div>
  );
}
