import { zodResolver } from "@hookform/resolvers/zod";
import { Check, LoaderCircle, Search, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { ApiError } from "../../lib/api";
import {
  useCreateHoldingMutation,
  useInstrumentSearchQuery,
  useUpdateHoldingMutation,
} from "./queries";
import type { Holding, HoldingUpdatePayload, Instrument } from "./types";

const decimalPattern = /^\d+(\.\d{1,4})?$/;
const integerPattern = /^\d+$/;

const baseSchema = z.object({
  average_cost: z
    .string()
    .trim()
    .min(1, "请输入平均持仓成本")
    .regex(decimalPattern, "成本须为非负数，最多 4 位小数"),
  quantity: z.string().trim().min(1, "请输入持股数量").regex(integerPattern, "数量须为非负整数"),
  opened_on: z.string().min(1, "请选择建仓日期"),
  note: z.string().max(1000, "备注不能超过 1,000 个字符"),
});

type HoldingForm = z.infer<typeof baseSchema>;

interface HoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: Holding | null;
}

function todayInShanghai(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function HoldingDialog({ open, onOpenChange, holding }: HoldingDialogProps) {
  const createMutation = useCreateHoldingMutation();
  const updateMutation = useUpdateHoldingMutation();
  const [instrumentQuery, setInstrumentQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<HoldingUpdatePayload | null>(null);
  const isEditing = holding !== null;
  const isClosed = holding?.status === "closed";
  const schema = useMemo(
    () =>
      baseSchema.superRefine((value, context) => {
        const quantity = Number(value.quantity);
        if (!isEditing && quantity <= 0) {
          context.addIssue({ code: "custom", path: ["quantity"], message: "新增持仓数量必须大于 0" });
        }
        if (value.opened_on > todayInShanghai()) {
          context.addIssue({ code: "custom", path: ["opened_on"], message: "建仓日期不得晚于今天" });
        }
      }),
    [isEditing],
  );
  const form = useForm<HoldingForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      average_cost: "",
      quantity: "",
      opened_on: todayInShanghai(),
      note: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    setInstrumentQuery(holding ? `${holding.ticker} · ${holding.name}` : "");
    setDebouncedQuery("");
    setSelectedInstrument(null);
    setSelectionError(null);
    setPendingClose(null);
    form.reset({
      average_cost: holding ? String(holding.average_cost) : "",
      quantity: holding ? String(holding.quantity) : "",
      opened_on: holding?.opened_on ?? todayInShanghai(),
      note: holding?.note ?? "",
    });
    createMutation.reset();
    updateMutation.reset();
  }, [open, holding]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(selectedInstrument ? "" : instrumentQuery.trim());
    }, 280);
    return () => window.clearTimeout(timer);
  }, [instrumentQuery, selectedInstrument]);

  const instrumentSearch = useInstrumentSearchQuery(debouncedQuery);
  const isPending = createMutation.isPending || updateMutation.isPending;
  const mutationError = createMutation.error ?? updateMutation.error;
  const errorMessage =
    mutationError instanceof ApiError
      ? mutationError.message
      : mutationError
        ? "保存失败，请稍后重试"
        : null;

  const persistUpdate = async (payload: HoldingUpdatePayload) => {
    if (!holding) return;
    await updateMutation.mutateAsync({ id: holding.id, payload });
    setPendingClose(null);
    onOpenChange(false);
  };

  const submitValues = async (values: HoldingForm) => {
    try {
      if (holding) {
        const payload: HoldingUpdatePayload = isClosed
          ? { note: values.note.trim() || null }
          : {
              average_cost: Number(values.average_cost),
              quantity: Number(values.quantity),
              opened_on: values.opened_on,
              note: values.note.trim() || null,
            };
        if (!isClosed && payload.quantity === 0) {
          setPendingClose(payload);
          return;
        }
        await persistUpdate(payload);
        return;
      }

      if (!selectedInstrument) {
        setSelectionError("请从检索候选项中选择一个有效标的");
        return;
      }
      await createMutation.mutateAsync({
        thscode: selectedInstrument.thscode,
        average_cost: Number(values.average_cost),
        quantity: Number(values.quantity),
        opened_on: values.opened_on,
        note: values.note.trim() || null,
      });
      onOpenChange(false);
    } catch {
      // Mutation errors stay visible in the dialog.
    }
  };

  const onSubmit = form.handleSubmit(submitValues);
  const title = isClosed ? "编辑清仓备注" : isEditing ? "编辑当前持仓" : "新增持仓";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(680px,calc(100vw-64px))]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {isClosed
                ? "已清仓记录只保留历史快照与备注；再次持有请创建新持仓。"
                : isEditing
                  ? "标的身份不可替换。数量保存为 0 时，将转入已清仓记录。"
                  : "先从数据源返回的候选项中选定 A 股或 ETF，再记录成本与数量。"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} noValidate>
            <div className="space-y-5 px-6 py-5">
              {!isEditing && (
                <div>
                  <label
                    htmlFor="holding-instrument-search"
                    className="mb-2 block text-xs font-medium text-ink"
                  >
                    股票 / ETF
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-3.5 text-ink-faint" size={15} />
                    <Input
                      id="holding-instrument-search"
                      value={instrumentQuery}
                      onChange={(event) => {
                        setInstrumentQuery(event.target.value);
                        setSelectedInstrument(null);
                        setSelectionError(null);
                      }}
                      placeholder="输入代码或名称，例如 600519、沪深300ETF"
                      className="pl-10"
                      autoComplete="off"
                      aria-label="股票或 ETF"
                    />
                    {debouncedQuery && !selectedInstrument && (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-60 overflow-y-auto rounded-[3px] border border-line bg-paper p-1.5 shadow-[0_18px_50px_rgba(23,33,29,.18)]">
                        {instrumentSearch.isLoading && (
                          <div className="flex items-center gap-2 px-3 py-4 text-xs text-ink-muted">
                            <LoaderCircle className="animate-spin" size={14} /> 正在检索标的
                          </div>
                        )}
                        {instrumentSearch.isError && (
                          <div className="px-3 py-4 text-xs text-market-up">
                            {instrumentSearch.error instanceof ApiError
                              ? instrumentSearch.error.message
                              : "标的检索失败"}
                          </div>
                        )}
                        {instrumentSearch.data?.items.map((item) => (
                          <button
                            key={item.thscode}
                            type="button"
                            className="flex w-full items-center gap-3 rounded-[2px] px-3 py-2.5 text-left transition hover:bg-paper-deep"
                            onClick={() => {
                              setSelectedInstrument(item);
                              setInstrumentQuery(`${item.ticker} · ${item.name}`);
                              setSelectionError(null);
                            }}
                          >
                            <span className="grid size-8 place-items-center border border-line bg-paper-deep font-mono text-[10px] text-ink-muted">
                              {item.exchange}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-ink">{item.name}</span>
                              <span className="mt-0.5 block font-mono text-[10px] text-ink-faint">{item.thscode}</span>
                            </span>
                            <Badge variant="neutral">{item.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>
                          </button>
                        ))}
                        {instrumentSearch.data?.items.length === 0 && (
                          <div className="px-3 py-4 text-xs text-ink-muted">没有找到可持有的 A 股或 ETF</div>
                        )}
                      </div>
                    )}
                  </div>
                  {selectedInstrument && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-market-down">
                      <Check size={13} /> 已选择 {selectedInstrument.thscode} · {selectedInstrument.name}
                    </div>
                  )}
                  {selectionError && <p className="mt-1.5 text-xs text-market-up">{selectionError}</p>}
                </div>
              )}

              {isEditing && (
                <div className="grid grid-cols-[110px_1fr_auto] items-center gap-4 border border-line bg-paper-deep/45 px-4 py-3">
                  <span className="font-mono text-[9px] tracking-[.12em] text-ink-faint">INSTRUMENT</span>
                  <span className="text-sm font-semibold text-ink">
                    {holding.ticker} · {holding.name}
                  </span>
                  <Badge>{holding.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>
                </div>
              )}

              {!isClosed && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="平均持仓成本" error={form.formState.errors.average_cost?.message}>
                      <Input
                        type="number"
                        min="0"
                        step="0.0001"
                        placeholder="0.0000"
                        {...form.register("average_cost")}
                      />
                    </Field>
                    <Field label="持股数量" error={form.formState.errors.quantity?.message}>
                      <Input type="number" min="0" step="1" placeholder="0" {...form.register("quantity")} />
                    </Field>
                  </div>
                  <Field label="建仓日期" error={form.formState.errors.opened_on?.message}>
                    <Input type="date" max={todayInShanghai()} {...form.register("opened_on")} />
                  </Field>
                </>
              )}

              <Field label="备注" error={form.formState.errors.note?.message} hint={`${form.watch("note").length}/1000`}>
                <textarea
                  className="min-h-24 w-full resize-y rounded-[3px] border border-line bg-paper px-3.5 py-3 text-sm leading-6 text-ink outline-none transition placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
                  placeholder="记录建仓逻辑、计划或需要复盘的事项（可选）"
                  {...form.register("note")}
                />
              </Field>

              {!isClosed && (
                <div className="flex gap-3 border border-accent/20 bg-accent/6 px-4 py-3 text-xs leading-5 text-ink-muted">
                  <ShieldAlert className="mt-0.5 shrink-0 text-accent-deep" size={16} />
                  V1 只维护持仓快照，不录入逐笔交易、卖出价格、佣金或已实现盈亏。
                </div>
              )}

              {errorMessage && (
                <div role="alert" className="border-l-2 border-market-up bg-market-up/6 px-4 py-3 text-sm text-market-up">
                  {errorMessage}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <LoaderCircle className="animate-spin" size={15} />}
                {isClosed ? "保存备注" : isEditing ? "保存修改" : "保存持仓"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingClose !== null} onOpenChange={(next) => !next && setPendingClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清仓“{holding?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              保存后数量变为 0，系统会自动记录当前清仓时间并将该记录移入“已清仓”。V1 不计算已实现盈亏。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>返回修改</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingClose) void persistUpdate(pendingClose);
              }}
            >
              确认清仓
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between text-xs font-semibold tracking-[.06em] text-ink-muted">
        {label}
        {hint && <span className="font-mono text-[9px] font-normal tracking-normal text-ink-faint">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-xs text-market-up">{error}</span>}
    </label>
  );
}
