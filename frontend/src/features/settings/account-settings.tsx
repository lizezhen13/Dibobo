import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LoaderCircle, LogOut } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { ApiError } from "../../lib/api";
import { useChangePasswordMutation } from "./queries";

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "请输入原密码"),
    new_password: z
      .string()
      .min(8, "新密码至少需要 8 位")
      .regex(/[A-Za-z]/, "新密码必须包含字母")
      .regex(/\d/, "新密码必须包含数字"),
    confirm_password: z.string().min(1, "请再次输入新密码"),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    path: ["confirm_password"],
    message: "两次输入的新密码不一致",
  })
  .refine((values) => values.current_password !== values.new_password, {
    path: ["new_password"],
    message: "新密码不能与原密码相同",
  });

type PasswordForm = z.infer<typeof passwordSchema>;

export function AccountSettings() {
  const mutation = useChangePasswordMutation();
  const navigate = useNavigate();
  const form = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      form.reset();
      navigate("/login", { replace: true });
    } catch {
      // 请求错误在下方展示
    }
  });

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? "密码修改失败，请稍后重试"
        : null;

  return (
    <div className="max-w-[850px] animate-enter">
      <Card className="overflow-hidden">
        <form onSubmit={onSubmit} className="p-7" noValidate>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <PasswordField
              label="原密码"
              error={form.formState.errors.current_password?.message}
              className="col-span-2 max-w-[calc(50%-12px)]"
            >
              <Input
                type="password"
                autoComplete="current-password"
                {...form.register("current_password")}
              />
            </PasswordField>
            <PasswordField label="新密码" error={form.formState.errors.new_password?.message}>
              <Input type="password" autoComplete="new-password" {...form.register("new_password")} />
            </PasswordField>
            <PasswordField label="确认新密码" error={form.formState.errors.confirm_password?.message}>
              <Input type="password" autoComplete="new-password" {...form.register("confirm_password")} />
            </PasswordField>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-[0.85rem] leading-relaxed text-muted-foreground">
            <KeyRound className="mt-0.5 shrink-0 text-primary/80" size={15} />
            新密码至少 8 位，并同时包含字母和数字。密码不会进入浏览器持久化存储或应用日志。
          </div>

          {errorMessage && (
            <div role="alert" className="mt-5 rounded-lg border-l-4 border-market-up bg-market-up/6 px-4 py-3 text-[0.9rem] text-market-up">
              {errorMessage}
            </div>
          )}

          <div className="mt-7 flex items-center justify-center gap-3 border-t border-border pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset({ current_password: "", new_password: "", confirm_password: "" })}
            >
              重置
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <LogOut size={15} />
              )}
              确定
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function PasswordField({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-[0.8rem] font-semibold tracking-[0.05em] text-muted-foreground">
        {label}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-[0.8rem] text-danger">{error}</span>}
    </label>
  );
}
