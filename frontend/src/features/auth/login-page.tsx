import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ApiError } from "../../lib/api";
import { useLoginMutation } from "./queries";

const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名").max(50, "用户名不能超过 50 个字符"),
  password: z.string().min(1, "请输入密码").max(256),
});

type LoginForm = z.infer<typeof loginSchema>;

const indexMarks = [
  ["SH", "000001"],
  ["CYB", "399006"],
  ["CSI", "000300"],
  ["STAR", "000688"],
] as const;

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const mutation = useLoginMutation();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : "/overview", { replace: true });
    } catch {
      // The mutation error is rendered below without retaining the password.
    }
  });

  const errorMessage =
    mutation.error instanceof ApiError ? mutation.error.message : mutation.error ? "登录失败，请稍后重试" : null;

  return (
    <main className="grid min-h-screen grid-cols-[minmax(560px,1.18fr)_minmax(430px,.82fr)] overflow-hidden bg-paper">
      <section className="fine-noise paper-grid relative isolate flex min-h-screen flex-col overflow-hidden bg-ink px-[clamp(48px,6vw,96px)] py-12 text-paper">
        <div className="relative z-10 flex items-center gap-3 animate-enter">
          <div className="grid size-9 place-items-center border border-accent/80 font-mono text-sm text-accent">D</div>
          <div>
            <p className="font-display text-xl tracking-[.08em]">DIBOBO</p>
            <p className="mt-0.5 text-[10px] tracking-[.22em] text-paper/45">DIVIDEND WORKBENCH</p>
          </div>
        </div>

        <div className="relative z-10 my-auto max-w-2xl animate-enter-delayed">
          <div className="mb-7 flex items-center gap-3 text-[11px] tracking-[.18em] text-accent">
            <span className="h-px w-11 bg-accent" />
            A 股 · 低波红利策略
          </div>
          <h1 className="font-display text-[clamp(48px,5.2vw,78px)] leading-[1.08] tracking-[-.035em]">
            把市场噪声，
            <br />
            留在<span className="text-accent">账簿之外</span>。
          </h1>
          <p className="mt-8 max-w-xl text-[15px] leading-8 tracking-wide text-paper/58">
            指数行情、持仓、红利指标与投资日记，在一个私有、克制、可追溯的数据工作台中归位。
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-4 border-y border-paper/12 py-5">
          {indexMarks.map(([label, code], index) => (
            <div key={code} className={index > 0 ? "border-l border-paper/12 pl-5" : ""}>
              <p className="font-mono text-[10px] tracking-[.14em] text-paper/38">{label}</p>
              <p className="mt-2 font-mono text-sm text-paper/75">{code}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-[clamp(48px,6vw,92px)]">
        <div className="absolute right-9 top-8 font-mono text-[10px] tracking-[.16em] text-ink-faint">V1.0 / PRIVATE</div>
        <div className="w-full max-w-[420px] animate-enter">
          <div className="mb-9">
            <div className="mb-5 grid size-11 place-items-center rounded-full border border-line bg-paper-deep text-ink-muted">
              <LockKeyhole size={18} strokeWidth={1.7} />
            </div>
            <h2 className="font-display text-[34px] tracking-[-.02em] text-ink">登录工作台</h2>
            <p className="mt-3 text-sm leading-6 text-ink-muted">使用部署人员为你创建的账号。系统不开放自主注册。</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="username" className="mb-2 block text-xs font-semibold tracking-[.08em] text-ink-muted">
                用户名
              </label>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                placeholder="请输入用户名"
                aria-invalid={Boolean(form.formState.errors.username)}
                {...form.register("username")}
              />
              {form.formState.errors.username && (
                <p className="mt-1.5 text-xs text-market-up">{form.formState.errors.username.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-xs font-semibold tracking-[.08em] text-ink-muted">
                密码
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  className="pr-11"
                  aria-invalid={Boolean(form.formState.errors.password)}
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-1 top-1 grid size-9 place-items-center rounded text-ink-faint transition hover:text-ink"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="mt-1.5 text-xs text-market-up">{form.formState.errors.password.message}</p>
              )}
            </div>

            {errorMessage && (
              <div role="alert" className="border-l-2 border-market-up bg-market-up/6 px-3.5 py-3 text-sm text-market-up">
                {errorMessage}
              </div>
            )}

            <Button type="submit" size="lg" className="mt-2 w-full" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" size={17} /> 正在登录
                </>
              ) : (
                <>
                  进入 Dibobo <ArrowRight size={17} />
                </>
              )}
            </Button>
          </form>

          <p className="mt-10 border-t border-line pt-5 text-[11px] leading-5 text-ink-faint">
            登录即表示你知悉：数据仅供参考，不构成任何投资建议。
          </p>
        </div>
      </section>
    </main>
  );
}
