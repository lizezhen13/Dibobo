import type { ColumnDef } from "@tanstack/react-table";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";

interface RecordData {
  id: string;
  name: string;
  price: number;
  note: string;
}
const data: RecordData[] = [
  { id: "first", name: "第一只标的", price: 12.3, note: "需要完整保留的观察备注" },
  { id: "second", name: "第二只标的", price: 8, note: "第二条备注" },
];

function columns(onSort = vi.fn(), onEdit = vi.fn()): ColumnDef<RecordData, unknown>[] {
  return [
    { accessorKey: "name", header: "名称" },
    { accessorKey: "price", header: () => <button onClick={onSort}>按价格排序</button> },
    { accessorKey: "note", header: "备注" },
    { id: "actions", header: "操作", cell: ({ row }) => <button onClick={() => onEdit(row.original.id)}>编辑</button> },
  ];
}

describe("responsive data table", () => {
  it("keeps secondary fields, sorting and feature actions in the mobile record", () => {
    const onSort = vi.fn(),
      onEdit = vi.fn();
    const { container } = render(
      <DataTable
        columns={columns(onSort, onEdit)}
        data={data}
        empty="暂无数据"
        mobile={{ titleColumn: "name", primaryColumns: ["price"] }}
      />,
    );
    const card = within(container.querySelector(".record-card") as HTMLElement);
    expect(card.getByText("第一只标的")).toBeInTheDocument();
    expect(card.getByText("12.3")).toBeInTheDocument();
    expect(card.getByText("需要完整保留的观察备注").closest("details")).not.toBeNull();
    fireEvent.click(card.getByRole("button", { name: "按价格排序" }));
    expect(onSort).toHaveBeenCalledOnce();
    fireEvent.click(card.getByRole("button", { name: "编辑" }));
    expect(onEdit).toHaveBeenCalledWith("first");
  });

  it("provides button reordering with stable row ids", () => {
    const onReorder = vi.fn();
    render(
      <DataTable
        columns={columns()}
        data={data}
        getRowId={(row) => row.id}
        empty="暂无数据"
        mobile={{ titleColumn: "name", primaryColumns: ["price"] }}
        rowReorder={{ enabled: true, onReorder }}
      />,
    );
    expect(screen.getByRole("button", { name: "上移第 1 条" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "下移第 1 条" }));
    expect(onReorder).toHaveBeenCalledWith("first", "second");
  });

  it("leaves arrow keys on nested controls and ordinary rows available for their own behavior", () => {
    const { container } = render(<DataTable columns={columns()} data={data} empty="暂无数据" />);
    const row = container.querySelector("tbody tr") as HTMLElement;
    expect(fireEvent.keyDown(row, { key: "ArrowDown" })).toBe(true);
    expect(fireEvent.keyDown(within(row).getByRole("button", { name: "编辑" }), { key: "ArrowDown" })).toBe(true);
  });
});
