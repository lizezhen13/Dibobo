import { Landmark, LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ApiError } from "../../lib/api";
import { useLoginMutation } from "./queries";

interface LoginForm {
  username: string;
  password: string;
}

export function LoginPage() {
  const login = useLoginMutation();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ defaultValues: { username: "", password: "" } });

  const onSubmit = async (values: LoginForm) => {
    try {
      await login.mutateAsync(values);
      navigate("/overview", { replace: true });
    } catch {
      // 错误由 mutation.error 渲染
    }
  };

  const errorMessage = login.error instanceof ApiError ? login.error.message : login.error ? "登录失败，请稍后重试" : null;

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-shell px-6 py-12 text-paper">
      <div className="relative z-10 w-full max-w-[420px] animate-fade-in-up">
        {/* 品牌区 */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl border border-primary/40 bg-primary/10 text-primary shadow-raised">
            <Landmark size={30} strokeWidth={1.4} />
          </div>
          <h1 className="font-display text-4xl tracking-[0.04em] text-paper">DIBOBO</h1>
          <p className="mt-3 text-[0.9rem] leading-relaxed text-paper/45">你的私人投资工作台</p>
        </div>

        {/* 登录卡片 */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-dialog">
          <p className="eyebrow mb-5 text-paper/30">LOGIN</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="space-y-2">
              <label htmlFor="username" className="block text-[0.8rem] font-medium text-paper/65">
                用户名
              </label>
              <Input
                id="username"
                autoComplete="username"
                placeholder="请输入用户名"
                className="border-white/10 bg-white/[0.05] text-paper placeholder:text-paper/30 focus-visible:border-primary/40 focus-visible:ring-primary/25"
                {...register("username", { required: "请输入用户名" })}
              />
              {errors.username && <p className="text-[0.75rem] text-danger">{errors.username.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-[0.8rem] font-medium text-paper/65">
                密码
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                className="border-white/10 bg-white/[0.05] text-paper placeholder:text-paper/30 focus-visible:border-primary/40 focus-visible:ring-primary/25"
                {...register("password", { required: "请输入密码" })}
              />
              {errors.password && <p className="text-[0.75rem] text-danger">{errors.password.message}</p>}
            </div>

            {errorMessage && (
              <div role="alert" className="rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[0.9rem] text-danger">
                {errorMessage}
              </div>
            )}

            <Button type="submit" className="w-full text-base" disabled={login.isPending}>
              {login.isPending ? <LoaderCircle className="animate-spin" size={17} /> : null}
              {login.isPending ? "登录中…" : "进入工作台"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[0.7rem] tracking-[0.08em] text-paper/25">数据仅供参考，不构成任何投资建议</p>
      </div>
    </div>
  );
}
