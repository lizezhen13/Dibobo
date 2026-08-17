import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

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
import { InlineAlert, LoadingButton } from "../../components/patterns";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { ApiError } from "../../lib/api";
import { useCreateHoldingMutation, useInstrumentSearchQuery, useUpdateHoldingMutation } from "./queries";
import { HoldingFormFields } from "./holding-form-fields";
import { HoldingInstrumentField } from "./holding-instrument-field";
import {
  createHoldingSchema,
  getHoldingFormDefaults,
  toHoldingUpdatePayload,
  type HoldingForm,
  type StepperField,
} from "./holding-form-schema";
import type { Holding, HoldingUpdatePayload, Instrument } from "./types";

interface HoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: Holding | null;
  portfolioId?: string;
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
  const schema = useMemo(() => createHoldingSchema(isEditing, isClosed), [isClosed, isEditing]);
  const form = useForm<HoldingForm>({
    resolver: zodResolver(schema),
    defaultValues: getHoldingFormDefaults(null),
  });
  const watchedQuantity = form.watch("quantity");
  const isClosing = isEditing && !isClosed && Number(watchedQuantity) === 0;
  const quantityMinimum = isEditing ? 0 : 1;

  // Mutation/form object identities can change while a request is pending; reset only when the dialog target changes.
  useEffect(() => {
    if (!open) return;
    setInstrumentQuery(holding ? `${holding.ticker} · ${holding.name}` : "");
    setDebouncedQuery("");
    setSelectedInstrument(null);
    setSelectionError(null);
    setPendingClose(null);
    form.reset(getHoldingFormDefaults(holding));
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
  const errorMessage = mutationError instanceof ApiError ? mutationError.message : mutationError ? "保存失败，请稍后重试" : null;

  const adjustNumber = (field: StepperField, direction: 1 | -1, minimum: number, step: number, precision: number) => {
    const rawValue = form.getValues(field);
    const currentValue = rawValue === "" ? 0 : Number(rawValue);
    const safeValue = Number.isFinite(currentValue) ? currentValue : 0;
    const scale = 10 ** precision;
    const currentUnits = Math.round(safeValue * scale);
    const minimumUnits = Math.round(minimum * scale);
    const stepUnits = Math.round(step * scale);
    const nextUnits = Math.max(minimumUnits, currentUnits + direction * stepUnits);
    const nextValue = precision === 0 ? String(nextUnits) : (nextUnits / scale).toFixed(precision).replace(/\.?0+$/, "");
    form.setValue(field, nextValue, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  };

  const persistUpdate = async (payload: HoldingUpdatePayload) => {
    if (!holding) return;
    await updateMutation.mutateAsync({ id: holding.id, payload });
    setPendingClose(null);
    onOpenChange(false);
  };

  const submitValues = async (values: HoldingForm) => {
    try {
      if (holding) {
        const payload = toHoldingUpdatePayload(values, holding);
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
              {!isEditing ? (
                <HoldingInstrumentField
                  query={instrumentQuery}
                  onQueryChange={(value) => {
                    setInstrumentQuery(value);
                    setSelectedInstrument(null);
                    setSelectionError(null);
                  }}
                  debouncedQuery={debouncedQuery}
                  selectedInstrument={selectedInstrument}
                  onSelect={(instrument) => {
                    setSelectedInstrument(instrument);
                    setInstrumentQuery(`${instrument.ticker} · ${instrument.name}`);
                    setSelectionError(null);
                  }}
                  selectionError={selectionError}
                  search={instrumentSearch}
                />
              ) : (
                <div className="grid grid-cols-[110px_1fr_auto] items-center gap-4 rounded-xl border border-border bg-card-deep/45 px-4 py-3">
                  <span className="font-mono text-[0.65rem] tracking-[0.12em] text-muted-foreground/60">INSTRUMENT</span>
                  <span className="text-[0.95rem] font-semibold text-foreground">
                    {holding.ticker} · {holding.name}
                  </span>
                  <Badge>{holding.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>
                </div>
              )}

              <HoldingFormFields
                form={form}
                isClosed={isClosed}
                isClosing={isClosing}
                quantityMinimum={quantityMinimum}
                adjustNumber={adjustNumber}
              />

              {errorMessage && <InlineAlert>{errorMessage}</InlineAlert>}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" className="!text-[12px]" onClick={() => onOpenChange(false)} disabled={isPending}>
                取消
              </Button>
              <LoadingButton type="submit" loading={isPending}>
                {isClosed ? "保存清仓记录" : isEditing ? "保存修改" : "保存持仓"}
              </LoadingButton>
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
            <AlertDialogCancel className="!text-[12px]" disabled={isPending}>
              返回修改
            </AlertDialogCancel>
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
