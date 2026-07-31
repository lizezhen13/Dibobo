import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo } from "react";
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
  useCreateDataSourceMutation,
  useUpdateDataSourceMutation,
} from "./queries";
import type { DataSource, DataSourcePayload } from "./types";

interface DataSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DataSource | null;
}

export function DataSourceDialog({ open, onOpenChange, source }: DataSourceDialogProps) {
  const createMutation = useCreateDataSourceMutation();
  const updateMutation = useUpdateDataSourceMutation();
  const isEditing = source !== null;
  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, "请输入数据源名称").max(50, "名称不能超过 50 个字符"),
          provider_type: z.enum(["fuyao", "fuyao_compatible"]),
          base_url: z.url("请输入合法的 HTTP 或 HTTPS 地址"),
          api_key: z.string().max(2048, "API Key 过长"),
        })
        .superRefine((value, context) => {
          if (!isEditing && !value.api_key.trim()) {
            context.addIssue({ code: "custom", path: ["api_key"], message: "新增时必须填写 API Key" });
          }
          if (!/^https?:\/\//i.test(value.base_url)) {
            context.addIssue({ code: "custom", path: ["base_url"], message: "仅支持 HTTP 或 HTTPS 地址" });
          }
        }),
    [isEditing],
  );
  const form = useForm<DataSourcePayload>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      provider_type: "fuyao",
      base_url: "https://fuyao.aicubes.cn",
      api_key: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: source?.name ?? "",
      provider_type: source?.provider_type ?? "fuyao",
      base_url: source?.base_url ?? "https://fuyao.aicubes.cn",
      api_key: "",
    });
    createMutation.reset();
    updateMutation.reset();
  }, [open, source]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPending = createMutation.isPending || updateMutation.isPending;
  const mutationError = createMutation.error ?? updateMutation.error;
  const errorMessage =
    mutationError instanceof ApiError
      ? mutationError.message
      : mutationError
        ? "保存失败，请稍后重试"
        : null;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (source) {
        await updateMutation.mutateAsync({ id: source.id, payload: values });
      } else {
        await createMutation.mutateAsync(values);
      }
      onOpenChange(false);
    } catch {
      // The request error remains visible inside the dialog.
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑数据源" : "新增数据源"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "留空 API Key 表示保持原值；修改连接信息后需要重新测试并启用。"
              : "密钥只在提交时传输，服务端加密保存，之后不会再返回明文。"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <div className="space-y-5 px-6 py-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="数据源名称" error={form.formState.errors.name?.message}>
                <Input placeholder="例如：我的扶摇数据源" {...form.register("name")} />
              </Field>
              <Field label="数据源类型" error={form.formState.errors.provider_type?.message}>
                <select
                  className="h-11 w-full rounded-md border border-border bg-card px-3.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  {...form.register("provider_type")}
                >
                  <option value="fuyao">扶摇</option>
                  <option value="fuyao_compatible">扶摇兼容</option>
                </select>
              </Field>
            </div>

            <Field label="Base URL" error={form.formState.errors.base_url?.message}>
              <Input placeholder="https://fuyao.aicubes.cn" {...form.register("base_url")} />
            </Field>

            <Field
              label={isEditing ? "API Key（可选）" : "API Key"}
              error={form.formState.errors.api_key?.message}
              hint={isEditing ? `当前 ${source.api_key_mask}，留空表示不修改` : undefined}
            >
              <div className="relative">
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={isEditing ? "留空表示保持原密钥" : "请输入 API Key"}
                  className="pl-10"
                  {...form.register("api_key")}
                />
                <KeyRound className="absolute left-3.5 top-3.5 text-muted-foreground/60" size={15} />
              </div>
            </Field>

            <div className="flex gap-3 border border-market-down/15 bg-market-down/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 shrink-0 text-market-down" size={16} />
              浏览器刷新或再次编辑时只会看到固定掩码。完整密钥不会出现在查询响应、页面状态或日志中。
            </div>

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
              {isEditing ? "保存修改" : "保存数据源"}
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
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between text-xs font-semibold tracking-[.06em] text-muted-foreground">
        {label}
        {hint && <span className="font-normal tracking-normal text-muted-foreground/60">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-xs text-market-up">{error}</span>}
    </label>
  );
}

