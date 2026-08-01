import {
  BookOpenText,
  ChevronRight,
  CircleUserRound,
  Gauge,
  LogOut,
  Radar,
  Settings,
  WalletCards,
} from "lucide-react";
import { useMemo } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useLogoutMutation, useSessionQuery } from "../features/auth/queries";
import { useDataSourcesQuery } from "../features/settings/queries";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const navigation = [
  { to: "/overview", label: "总览面板", icon: Gauge, number: "01" },
  { to: "/holdings", label: "持仓管理", icon: WalletCards, number: "02" },
  { to: "/radar", label: "红利雷达", icon: Radar, number: "03" },
  { to: "/journals", label: "投资日记", icon: BookOpenText, number: "04" },
  { to: "/settings", label: "系统设置", icon: Settings, number: "05" },
] as const;

export function AppShell() {
  const session = useSessionQuery();
  const logout = useLogoutMutation();
  const location = useLocation();
  const navigate = useNavigate();
  // 判断是否有已启用的数据源，用于侧边栏底部的接入状态指示
  const dataSources = useDataSourcesQuery();
  const isConnected = dataSources.data?.some((source) => source.is_active) ?? false;
  const current = useMemo(
    () => navigation.find((item) => location.pathname.startsWith(item.to)) ?? navigation[0],
    [location.pathname],
  );

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      navigate("/login", { replace: true });
    } catch {
      // 服务端撤销会话失败时，保留当前视图
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-[260px_minmax(0,1fr)] bg-background">
      {/* 侧边栏：暗夜驾驶舱深黑外壳 */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[260px] flex-col overflow-hidden border-r border-dark-border bg-dark-bg text-dark-fg">
        <div className="relative z-10 flex h-[88px] items-center gap-3 border-b border-dark-border px-7">
          <div className="grid size-10 place-items-center rounded-lg bg-primary font-mono text-base font-semibold text-primary-foreground shadow-subtle">
            D
          </div>
          <div>
            <p className="font-display text-[1.35rem] tracking-[0.05em]">DIBOBO</p>
            <p className="mt-0.5 font-mono text-[0.6rem] tracking-[0.18em] text-dark-fg/40">
              PRIVATE WORKBENCH
            </p>
          </div>
        </div>

        <nav className="relative z-10 flex-1 px-3 py-6" aria-label="主导航">
          <p className="mb-3 px-4 font-mono text-[0.6rem] tracking-[0.18em] text-dark-fg/30">
            工作区 / WORKSPACE
          </p>
          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "group flex h-11 items-center gap-3 rounded-lg px-4 text-[0.9rem] tracking-wide text-dark-fg/55 transition-all duration-200 hover:bg-[rgba(255,255,255,0.04)] hover:text-dark-fg/90",
                      isActive &&
                        "bg-primary/[0.14] font-semibold text-primary hover:bg-primary/[0.14] hover:text-primary",
                    )
                  }
                >
                  <Icon size={17} strokeWidth={1.6} />
                  <span className="flex-1">{item.label}</span>
                  <span className="font-mono text-[0.6rem] text-dark-fg/25 transition group-hover:text-dark-fg/45">
                    {item.number}
                  </span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="relative z-10 border-t border-dark-border px-7 py-5">
          <div className="flex items-center gap-2">
            {/* 数据源接入状态指示灯：绿色为已接入，红色为未接入，辉光随令牌颜色联动 */}
            <span
              className="size-2 rounded-full"
              style={{
                backgroundColor: isConnected ? "var(--market-down)" : "var(--market-up)",
                boxShadow: `0 0 8px ${isConnected ? "rgba(34,197,94,0.7)" : "rgba(242,84,59,0.7)"}`,
              }}
              aria-hidden
            />
            <p className={cn("text-[0.7rem] leading-5", isConnected ? "text-market-down" : "text-market-up")}>
              {isConnected ? "已接入数据源" : "未接入数据源"}
            </p>
          </div>
        </div>
      </aside>

      <div className="col-start-2 flex min-h-screen min-w-0 flex-col">
        {/* 顶部标题栏：实底深色，无磨砂模糊 */}
        <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-border bg-background px-8 text-foreground">
          <div className="flex items-center gap-2 text-base">
            <span className="text-muted-foreground">Dibobo</span>
            <ChevronRight size={14} className="text-muted-foreground" />
            <span className="font-semibold text-foreground">{current.label}</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 border-r border-border pr-5 text-sm text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              行情状态 · 按页面更新
            </div>
            <div className="flex items-center gap-2.5 text-base text-muted-foreground">
              <CircleUserRound size={17} />
              <span className="font-medium text-foreground">
                {session.data?.user.username}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleLogout()}
              disabled={logout.isPending}
              aria-label="退出登录"
              className="text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <LogOut size={15} /> 退出
            </Button>
          </div>
        </header>

        <main className="flex-1 bg-background p-8 xl:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
