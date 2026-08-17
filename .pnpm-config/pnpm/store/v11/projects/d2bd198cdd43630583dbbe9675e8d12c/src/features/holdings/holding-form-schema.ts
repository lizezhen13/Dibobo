import { z } from "zod";

import type { Holding, HoldingUpdatePayload } from "./types";

const decimalPattern = /^\d+(\.\d{1,4})?$/;
const integerPattern = /^\d+$/;

const baseSchema = z.object({
  average_cost: z.string().trim().min(1, "请输入平均持仓成本").regex(decimalPattern, "成本须为非负数，最多 4 位小数"),
  quantity: z.string().trim().min(1, "请输入持股数量").regex(integerPattern, "数量须为非负整数"),
  opened_on: z.string().min(1, "请选择建仓日期"),
  note: z.string().max(1000, "备注不能超过 1,000 个字符"),
});

const closeFieldsSchema = z.object({
  close_price: z
    .string()
    .trim()
    .refine((value) => value === "" || decimalPattern.test(value), "清仓价格格式不正确，最多 4 位小数"),
  closed_on: z.string(),
  closed_quantity: z
    .string()
    .trim()
    .refine((value) => value === "" || integerPattern.test(value), "清仓数量必须为正整数"),
});

const formBaseSchema = baseSchema.merge(closeFieldsSchema);

export type HoldingForm = z.infer<typeof formBaseSchema>;
export type StepperField = "average_cost" | "quantity" | "close_price" | "closed_quantity";

export function todayInShanghai(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function createHoldingSchema(isEditing: boolean, isClosed: boolean) {
  return formBaseSchema.superRefine((value, context) => {
    const quantity = Number(value.quantity);
    if (!isEditing && quantity <= 0) {
      context.addIssue({ code: "custom", path: ["quantity"], message: "新增持仓数量必须大于 0" });
    }
    if (isEditing && !isClosed && quantity === 0) {
      if (!value.close_price || Number(value.close_price) <= 0) {
        context.addIssue({ code: "custom", path: ["close_price"], message: "清仓时请输入清仓价格" });
      }
      if (!value.closed_on) {
        context.addIssue({ code: "custom", path: ["closed_on"], message: "清仓时请选择清仓日期" });
      }
    }
    if (isClosed && value.closed_quantity && Number(value.closed_quantity) <= 0) {
      context.addIssue({ code: "custom", path: ["closed_quantity"], message: "清仓数量必须大于 0" });
    }
    const today = todayInShanghai();
    if (value.opened_on > today) {
      context.addIssue({ code: "custom", path: ["opened_on"], message: "建仓日期不得晚于今天" });
    }
    if (value.closed_on && value.closed_on > today) {
      context.addIssue({ code: "custom", path: ["closed_on"], message: "清仓日期不得晚于今天" });
    }
  });
}

export function getHoldingFormDefaults(holding: Holding | null): HoldingForm {
  const isClosed = holding?.status === "closed";
  return {
    average_cost: holding ? String(holding.average_cost) : "",
    quantity: holding ? String(holding.quantity) : "",
    opened_on: holding?.opened_on ?? todayInShanghai(),
    note: holding?.note ?? "",
    close_price: holding?.close_price != null ? String(holding.close_price) : holding?.latest != null ? String(holding.latest) : "",
    closed_on: holding?.closed_on ?? (holding && !isClosed ? todayInShanghai() : ""),
    closed_quantity: holding?.closed_quantity != null ? String(holding.closed_quantity) : "",
  };
}

export function toHoldingUpdatePayload(values: HoldingForm, holding: Holding): HoldingUpdatePayload {
  if (holding.status === "closed") {
    return {
      note: values.note.trim() || null,
      ...(values.close_price ? { close_price: Number(values.close_price) } : {}),
      ...(values.closed_on ? { closed_on: values.closed_on } : {}),
      ...(values.closed_quantity ? { closed_quantity: Number(values.closed_quantity) } : {}),
    };
  }

  return {
    average_cost: Number(values.average_cost),
    quantity: Number(values.quantity),
    opened_on: values.opened_on,
    note: values.note.trim() || null,
    ...(Number(values.quantity) === 0 ? { close_price: Number(values.close_price), closed_on: values.closed_on } : {}),
  };
}
