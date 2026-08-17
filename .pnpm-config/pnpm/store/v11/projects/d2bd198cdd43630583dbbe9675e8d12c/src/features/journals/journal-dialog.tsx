import { zodResolver } from "@hookform/resolvers/zod";
import { NotebookPen } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../components/ui/button";
import { FormField, InlineAlert, LoadingButton } from "../../components/patterns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { ApiError } from "../../lib/api";
import { useCreateJournalMutation, useUpdateJournalMutation } from "./queries";
import type { Journal } from "./types";

function todayInShanghai(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const journalSchema = z.object({
  journal_date: z
    .string()
    .min(1, "请选择日记日期")
    .refine((value) => value <= todayInShanghai(), { message: "日记日期不能选择未来日期" }),
  title: z.string().trim().min(1, "请输入标题").max(100, "标题不能超过 100 个字符"),
  content: z.string().trim().min(1, "请输入日记正文").max(20_000, "正文不能超过 20,000 个字符"),
});

type JournalForm = z.infer<typeof journalSchema>;

interface JournalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journal: Journal | null;
}

export function JournalDialog({ open, onOpenChange, journal }: JournalDialogProps) {
  const createMutation = useCreateJournalMutation();
  const updateMutation = useUpdateJournalMutation();
  const isEditing = journal !== null;
  const form = useForm<JournalForm>({
    resolver: zodResolver(journalSchema),
    defaultValues: { journal_date: todayInShanghai(), title: "", content: "" },
  });

  // Mutation/form object identities can change while a request is pending; reset only when the dialog target changes.
  useEffect(() => {
    if (!open) return;
    form.reset({
      journal_date: journal?.journal_date ?? todayInShanghai(),
      title: journal?.title ?? "",
      content: journal?.content ?? "",
    });
    createMutation.reset();
    updateMutation.reset();
  }, [open, journal]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPending = createMutation.isPending || updateMutation.isPending;
  const mutationError = createMutation.error ?? updateMutation.error;
  const errorMessage = mutationError instanceof ApiError ? mutationError.message : mutationError ? "保存失败，请稍后重试" : null;
  const titleLength = form.watch("title").length;
  const contentLength = form.watch("content").length;

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      journal_date: values.journal_date,
      title: values.title.trim(),
      content: values.content.trim(),
    };
    try {
      if (journal) {
        await updateMutation.mutateAsync({ id: journal.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      // Mutation errors remain visible in the form for retry.
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(780px,calc(100vw-64px))] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg border border-primary/20 bg-primary/8 text-primary">
              <NotebookPen size={17} />
            </span>
            <DialogTitle>{isEditing ? "编辑投资日记" : "写一篇投资日记"}</DialogTitle>
          </div>
          <DialogDescription>写下当时的判断、证据与风险，给未来的自己留下可复盘的原始切片。</DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit} noValidate>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-5">
              <FormField label="日记日期" required error={form.formState.errors.journal_date?.message}>
                <Input type="date" max={todayInShanghai()} className="date-input" {...form.register("journal_date")} />
              </FormField>
              <FormField label="标题" required error={form.formState.errors.title?.message} hint={`${titleLength}/100`}>
                <Input placeholder="例如：下跌并没有改变最初的买入理由" autoComplete="off" {...form.register("title")} />
              </FormField>
            </div>

            <FormField
              label="正文"
              required
              error={form.formState.errors.content?.message}
              hint={`${contentLength.toLocaleString("zh-CN")}/20,000`}
            >
              <Textarea
                className="min-h-[300px] rounded-xl px-4 py-4 leading-8"
                placeholder={"今天观察到了什么？\n原来的假设仍然成立吗？\n下一次行动的触发条件是什么？"}
                {...form.register("content")}
              />
            </FormField>

            {errorMessage && <InlineAlert>{errorMessage}</InlineAlert>}
          </div>

          <DialogFooter className="shrink-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              取消
            </Button>
            <LoadingButton type="submit" loading={isPending}>
              {isEditing ? "保存修改" : "保存日记"}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
