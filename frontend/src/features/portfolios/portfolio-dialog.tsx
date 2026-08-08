import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Orbit } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
  useCreatePortfolioMutation,
  useUpdatePortfolioMutation,
} from "../holdings/queries";
import type { Portfolio } from "../holdings/types";

const schema = z.object({
  name: z.string().trim().min(1, "请输入组合名称").max(50, "组合名称不能超过 50 个字符"),
  note: z.string().max(1000, "备注不能超过 1,000 个字符"),
  is_default: z.boolean(),
});

type PortfolioForm = z.infer<typeof schema>;

interface PortfolioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolio: Portfolio | null;
  onCreated?: (portfolio: Portfolio) => void;
}

export function PortfolioDialog({ open, onOpenChange, portfolio, onCreated }: PortfolioDialogProps) {
  const createMutation = useCreatePortfolioMutation();
  const updateMutation = useUpdatePortfolioMutation();
  const form = useForm<PortfolioForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", note: "", is_default: false },
  });
  const isEditing = portfolio !== null;
  const mutationError = createMutation.error ?? updateMutation.error;
  const errorMessage =
    mutationError instanceof ApiError
      ? mutationError.message
      : mutationError
        ? "保存失败，请稍后重试"
        : null;
  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: portfolio?.name ?? "",
      note: portfolio?.note ?? "",
      is_default: portfolio?.is_default ?? false,
    });
    createMutation.reset();
    updateMutation.reset();
  }, [open, portfolio]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = form.handleSubmit(async (values) => {
    try {
      if (portfolio) {
        await updateMutation.mutateAsync({
          id: portfolio.id,
          payload: { name: values.name.trim(), note: values.note.trim() || null },
        });
      } else {
        const created = await createMutation.mutateAsync({
          name: values.name.trim(),
          note: values.note.trim() || null,
          is_default: values.is_default,
        });
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch {
      // Mutation errors remain visible inside the dialog.
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,calc(100vw-48px))]">
        <DialogHeader>
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Orbit size={18} />
          </div>
          <DialogTitle>{isEditing ? "编辑投资组合" : "新建投资组合"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "只修改组合的识别信息，不会影响其中的股票和清仓历史。"
              : "先建立一个清晰的容器，再把股票按策略、账户或目标分组。"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          <div className="space-y-5 px-6 py-6">
            <Field label="组合名称" error={form.formState.errors.name?.message}>
              <Input autoFocus placeholder="例如：长期红利、ETF 轮动" {...form.register("name")} />
            </Field>

            <Field
              label="组合备注"
              error={form.formState.errors.note?.message}
              hint={`${form.watch("note").length}/1000`}
            >
              <textarea
                className="min-h-28 w-full resize-y rounded-lg border border-input bg-card px-3.5 py-3 text-[0.95rem] leading-7 text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-[3px] focus:ring-primary/15"
                placeholder="记录这个组合的策略、用途或观察重点（可选）"
                {...form.register("note")}
              />
            </Field>

            {!isEditing && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card-deep/40 px-4 py-3.5 transition hover:border-primary/35">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-[var(--primary)]"
                  {...form.register("is_default")}
                />
                <span>
                  <span className="block text-[0.9rem] font-semibold text-foreground">设为默认组合</span>
                  <span className="mt-1 block text-[0.78rem] leading-relaxed text-muted-foreground">
                    下次打开投资组合页面时，自动进入这个组合。
                  </span>
                </span>
              </label>
            )}

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
              {isEditing ? "保存修改" : "创建组合"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
