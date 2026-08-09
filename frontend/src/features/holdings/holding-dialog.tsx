import { zodResolver } from "@hookform/resolvers/zod";
import { format, parse } from "date-fns";
import { CalendarDays, Check, ChevronDown, ChevronUp, LoaderCircle, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
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
import { Calendar } from "../../components/ui/calendar";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { ApiError } from "../../lib/api";
import { cn } from "../../lib/utils";
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

const closeFieldsSchema = z.object({
  close_price: z.string().trim().refine(
    (value) => value === "" || decimalPattern.test(value),
    "清仓价格格式不正确，最多 4 位小数",
  ),
  closed_on: z.string(),
  closed_quantity: z.string().trim().refine(
    (value) => value === "" || integerPattern.test(value),
    "清仓数量必须为正整数",
  ),
});

const formBaseSchema = baseSchema.merge(closeFieldsSchema);
type HoldingForm = z.infer<typeof formBaseSchema>;
type StepperField = "average_cost" | "quantity" | "close_price" | "closed_quantity";

interface HoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: Holding | null;
  portfolioId?: string;
}

function todayInShanghai(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDialogDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDialogDate(date?: Date): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

function SingleDateField({
  value,
  max,
  placeholder,
  onChange,
}: {
  value: string;
  max?: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDialogDate(value);
  const maxDate = parseDialogDate(max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            !value && "text-muted-foreground",
          )}
          aria-haspopup="dialog"
        >
          <span className="truncate">{value || placeholder}</span>
          <CalendarDays className="shrink-0 text-muted-foreground" size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) return;
            onChange(formatDialogDate(date));
            setOpen(false);
          }}
          disabled={maxDate ? { after: maxDate } : undefined}
        />
        <div className="flex items-center justify-between border-t border-border px-1 pt-2">
          <span className="text-xs text-muted-foreground">{value || "未选择日期"}</span>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            清除
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function HoldingDialog({ open, onOpenChange, holding, portfolioId }: HoldingDialogProps) {
  const createMutation = useCreateHoldingMutation(portfolioId);
  const updateMutation = useUpdateHoldingMutation(portfolioId);
  const [instrumentQuery, setInstrumentQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<HoldingUpdatePayload | null>(null);
  const isEditing = holding !== null;
  const isClosed = holding?.status === "closed";
  const schema = useMemo(
    () =>
      formBaseSchema.superRefine((value, context) => {
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
        if (value.opened_on > todayInShanghai()) {
          context.addIssue({ code: "custom", path: ["opened_on"], message: "建仓日期不得晚于今天" });
        }
        if (value.closed_on && value.closed_on > todayInShanghai()) {
          context.addIssue({ code: "custom", path: ["closed_on"], message: "清仓日期不得晚于今天" });
        }
      }),
    [isClosed, isEditing],
  );
  const form = useForm<HoldingForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      average_cost: "",
      quantity: "",
      opened_on: todayInShanghai(),
      note: "",
      close_price: "",
      closed_on: "",
      closed_quantity: "",
    },
  });
  const watchedAverageCost = form.watch("average_cost");
  const watchedQuantity = form.watch("quantity");
  const watchedClosePrice = form.watch("close_price");
  const watchedClosedQuantity = form.watch("closed_quantity");
  const watchedOpenedOn = form.watch("opened_on");
  const watchedClosedOn = form.watch("closed_on");
  const isClosing = isEditing && !isClosed && Number(watchedQuantity) === 0;
  const quantityMinimum = isEditing ? 0 : 1;

  const adjustNumber = (
    field: StepperField,
    direction: 1 | -1,
    minimum: number,
    step: number,
    precision: number,
  ) => {
    const rawValue = form.getValues(field);
    const currentValue = rawValue === "" ? 0 : Number(rawValue);
    const safeValue = Number.isFinite(currentValue) ? currentValue : 0;
    const scale = 10 ** precision;
    const currentUnits = Math.round(safeValue * scale);
    const minimumUnits = Math.round(minimum * scale);
    const stepUnits = Math.round(step * scale);
    const nextUnits = Math.max(minimumUnits, currentUnits + direction * stepUnits);
    const nextValue = precision === 0
      ? String(nextUnits)
      : (nextUnits / scale).toFixed(precision).replace(/\.?0+$/, "");
    form.setValue(field, nextValue, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  };

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
      close_price: holding?.close_price != null
        ? String(holding.close_price)
        : holding?.latest != null
          ? String(holding.latest)
          : "",
      closed_on: holding?.closed_on ?? (holding && !isClosed ? todayInShanghai() : ""),
      closed_quantity: holding?.closed_quantity != null ? String(holding.closed_quantity) : "",
    });
    createMutation.reset();
    updateMutation.reset();
  }, [open, holding, portfolioId]); // eslint-disable-line react-hooks/exhaustive-deps

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
          ? {
              note: values.note.trim() || null,
              ...(values.close_price ? { close_price: Number(values.close_price) } : {}),
              ...(values.closed_on ? { closed_on: values.closed_on } : {}),
              ...(values.closed_quantity ? { closed_quantity: Number(values.closed_quantity) } : {}),
            }
          : {
              average_cost: Number(values.average_cost),
              quantity: Number(values.quantity),
              opened_on: values.opened_on,
              note: values.note.trim() || null,
              ...(Number(values.quantity) === 0
                ? { close_price: Number(values.close_price), closed_on: values.closed_on }
                : {}),
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
  const title = isClosed ? "编辑清仓记录" : isEditing ? "编辑当前持仓" : "新增持仓";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(680px,calc(100vw-64px))]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {isClosed
                ? "可补录清仓数量、价格和日期；再次持有请创建新持仓。"
                : isEditing
                  ? "标的身份不可替换。数量保存为 0 时，需要填写清仓价格和日期后转入已清仓记录。"
                  : "先从数据源返回的候选项中选定 A 股或 ETF，再记录成本与数量。"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} noValidate>
            <div className="space-y-5 px-6 py-6">
              {!isEditing && (
                <div>
                  <label
                    htmlFor="holding-instrument-search"
                    className="mb-2 block text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground"
                  >
                    股票 / ETF
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-3.5 text-muted-foreground/60" size={15} />
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
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-60 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-dialog">
                        {instrumentSearch.isLoading && (
                          <div className="flex items-center gap-2 px-3 py-4 text-[0.85rem] text-muted-foreground">
                            <LoaderCircle className="animate-spin" size={14} /> 正在检索标的
                          </div>
                        )}
                        {instrumentSearch.isError && (
                          <div className="px-3 py-4 text-[0.85rem] text-market-up">
                            {instrumentSearch.error instanceof ApiError
                              ? instrumentSearch.error.message
                              : "标的检索失败"}
                          </div>
                        )}
                        {instrumentSearch.data?.items.map((item) => (
                          <button
                            key={item.thscode}
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-card-deep"
                            onClick={() => {
                              setSelectedInstrument(item);
                              setInstrumentQuery(`${item.ticker} · ${item.name}`);
                              setSelectionError(null);
                            }}
                          >
                            <span className="grid size-8 place-items-center rounded border border-border bg-card-deep font-mono text-[0.7rem] text-muted-foreground">
                              {item.exchange}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[0.95rem] font-semibold text-foreground">{item.name}</span>
                              <span className="mt-0.5 block font-mono text-[0.7rem] text-muted-foreground/60">{item.thscode}</span>
                            </span>
                            <Badge variant="neutral">{item.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>
                          </button>
                        ))}
                        {instrumentSearch.data?.items.length === 0 && (
                          <div className="px-3 py-4 text-[0.85rem] text-muted-foreground">没有找到可持有的 A 股或 ETF</div>
                        )}
                      </div>
                    )}
                  </div>
                  {selectedInstrument && (
                    <div className="mt-2 flex items-center gap-2 text-[0.8rem] text-market-down">
                      <Check size={13} /> 已选择 {selectedInstrument.thscode} · {selectedInstrument.name}
                    </div>
                  )}
                  {selectionError && <p className="mt-1.5 text-[0.8rem] text-danger">{selectionError}</p>}
                </div>
              )}

              {isEditing && (
                <div className="grid grid-cols-[110px_1fr_auto] items-center gap-4 rounded-xl border border-border bg-card-deep/45 px-4 py-3">
                  <span className="font-mono text-[0.65rem] tracking-[0.12em] text-muted-foreground/60">INSTRUMENT</span>
                  <span className="text-[0.95rem] font-semibold text-foreground">
                    {holding.ticker} · {holding.name}
                  </span>
                  <Badge>{holding.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>
                </div>
              )}

              {!isClosed && (
                <>
                  <div className="grid grid-cols-2 gap-5">
                    <Field label="平均持仓成本" error={form.formState.errors.average_cost?.message}>
                      <NumberStepper
                        min={0}
                        step={1}
                        value={watchedAverageCost}
                        placeholder="0.0000"
                        registration={form.register("average_cost")}
                        onStep={(direction) => adjustNumber("average_cost", direction, 0, 1, 4)}
                        ariaLabel="平均持仓成本"
                      />
                    </Field>
                    <Field label="持股数量" error={form.formState.errors.quantity?.message}>
                      <NumberStepper
                        min={quantityMinimum}
                        step={1}
                        value={watchedQuantity}
                        placeholder="0"
                        registration={form.register("quantity")}
                        onStep={(direction) => adjustNumber("quantity", direction, quantityMinimum, 1, 0)}
                        ariaLabel="持股数量"
                      />
                    </Field>
                  </div>
                  <Field label="建仓日期" error={form.formState.errors.opened_on?.message}>
                    <SingleDateField
                      value={watchedOpenedOn}
                      max={todayInShanghai()}
                      placeholder="请选择建仓日期"
                      onChange={(value) =>
                        form.setValue("opened_on", value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })
                      }
                    />
                  </Field>
                  {isClosing && (
                    <div className="grid grid-cols-2 gap-5 rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
                      <Field label="清仓价格" error={form.formState.errors.close_price?.message}>
                        <NumberStepper
                          min={0.0001}
                          step={1}
                          value={watchedClosePrice}
                          placeholder="请输入实际清仓价格"
                          registration={form.register("close_price")}
                          onStep={(direction) => adjustNumber("close_price", direction, 0.0001, 1, 4)}
                          ariaLabel="清仓价格"
                        />
                      </Field>
                      <Field label="清仓日期" error={form.formState.errors.closed_on?.message}>
                        <SingleDateField
                          value={watchedClosedOn}
                          max={todayInShanghai()}
                          placeholder="请选择清仓日期"
                          onChange={(value) =>
                            form.setValue("closed_on", value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })
                          }
                        />
                      </Field>
                    </div>
                  )}
                </>
              )}

              {isClosed && (
                <>
                  <div className="grid grid-cols-2 gap-5 rounded-xl border border-border bg-card-deep/30 p-4">
                    <Field label="清仓数量" error={form.formState.errors.closed_quantity?.message}>
                      <NumberStepper
                        min={1}
                        step={1}
                        value={watchedClosedQuantity}
                        placeholder="历史记录可补录"
                        registration={form.register("closed_quantity")}
                        onStep={(direction) => adjustNumber("closed_quantity", direction, 1, 1, 0)}
                        ariaLabel="清仓数量"
                      />
                    </Field>
                    <Field label="清仓价格" error={form.formState.errors.close_price?.message}>
                      <NumberStepper
                        min={0.0001}
                        step={1}
                        value={watchedClosePrice}
                        placeholder="历史记录可补录"
                        registration={form.register("close_price")}
                        onStep={(direction) => adjustNumber("close_price", direction, 0.0001, 1, 4)}
                        ariaLabel="清仓价格"
                      />
                    </Field>
                  </div>
                  <Field label="清仓日期" error={form.formState.errors.closed_on?.message}>
                    <SingleDateField
                      value={watchedClosedOn}
                      max={todayInShanghai()}
                      placeholder="请选择清仓日期"
                      onChange={(value) =>
                        form.setValue("closed_on", value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })
                      }
                    />
                  </Field>
                </>
              )}

              <Field label="备注" error={form.formState.errors.note?.message} hint={`${form.watch("note").length}/1000`}>
                <textarea
                  className="min-h-24 w-full resize-y rounded-lg border border-input bg-card px-3.5 py-3 text-[0.95rem] leading-7 text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-[3px] focus:ring-primary/15"
                  placeholder="记录建仓逻辑、计划或需要复盘的事项（可选）"
                  {...form.register("note")}
                />
              </Field>

              {errorMessage && (
                <div role="alert" className="rounded-lg border-l-4 border-market-up bg-market-up/6 px-4 py-3 text-[0.9rem] text-danger">
                  {errorMessage}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" className="!text-[12px]" onClick={() => onOpenChange(false)} disabled={isPending}>
                取消
              </Button>
              <Button type="submit" className="!text-[12px]" disabled={isPending}>
                {isPending && <LoaderCircle className="animate-spin" size={15} />}
                {isClosed ? "保存清仓记录" : isEditing ? "保存修改" : "保存持仓"}
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
              确认后会记录清仓数量、清仓价格和清仓日期，并计算本次清仓的已实现盈亏。本版本暂不计算佣金和税费。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="!text-[12px]" disabled={isPending}>返回修改</AlertDialogCancel>
            <AlertDialogAction
              className="!text-[12px]"
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
      <span className="mb-2 flex items-center justify-between text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground">
        {label}
        {hint && <span className="font-mono text-[0.7rem] font-normal tracking-normal text-muted-foreground/60">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-[0.8rem] text-danger">{error}</span>}
    </label>
  );
}

function NumberStepper({
  min,
  step,
  value,
  placeholder,
  registration,
  onStep,
  ariaLabel,
}: {
  min: number;
  step: number;
  value: string;
  placeholder: string;
  registration: UseFormRegisterReturn;
  onStep: (direction: 1 | -1) => void;
  ariaLabel?: string;
}) {
  const numericValue = value === "" ? 0 : Number(value);
  const canDecrease = Number.isFinite(numericValue) && numericValue > min;

  return (
    <div className="group relative">
      <Input
        type="number"
        min={min}
        step={step}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="holding-number-input pr-10"
        {...registration}
      />
      <div className="invisible absolute right-1 top-1/2 z-10 flex -translate-y-1/2 flex-col overflow-hidden rounded-md border border-border/70 bg-card-deep shadow-subtle opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
        <button
          type="button"
          className="pointer-events-auto grid h-4 w-6 place-items-center text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-primary disabled:pointer-events-none disabled:opacity-30"
          onClick={() => onStep(1)}
          aria-label={`增加${ariaLabel ?? "数值"}`}
        >
          <ChevronUp size={12} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className="pointer-events-auto grid h-4 w-6 place-items-center text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-primary disabled:pointer-events-none disabled:opacity-30"
          onClick={() => onStep(-1)}
          disabled={!canDecrease}
          aria-label={`减少${ariaLabel ?? "数值"}`}
        >
          <ChevronDown size={12} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
