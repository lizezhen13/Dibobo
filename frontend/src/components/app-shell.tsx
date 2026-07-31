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
      {/* 侧边栏：恢复原版磨砂深色外壳 */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[260px] flex-col overflow-hidden border-r border-[rgba(255,255,255,0.08)] bg-[rgba(17,17,17,0.72)] text-[#fcfaf7] backdrop-blur-md">
        <div className="relative z-10 flex h-[88px] items-center gap-3 border-b border-[rgba(255,255,255,0.10)] px-7">
          <div className="grid size-10 place-items-center rounded-lg border border-primary/60 bg-primary/10 font-mono text-base text-primary shadow-subtle">
            D
          </div>
          <div>
            <p className="font-display text-[1.35rem] tracking-[0.05em]">DIBOBO</p>
            <p className="mt-0.5 text-[0.6rem] tracking-[0.18em] text-[#fcfaf7]/40">
              PRIVATE WORKBENCH
            </p>
          </div>
        </div>

        <nav className="relative z-10 flex-1 px-3 py-6" aria-label="主导航">
          <p className="mb-3 px-4 text-[0.6rem] tracking-[0.18em] text-[#fcfaf7]/30">
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
                      "group flex h-11 items-center gap-3 rounded-lg px-4 text-[0.9rem] tracking-wide text-[#fcfaf7]/55 transition-all duration-200 hover:bg-[rgba(255,255,255,0.06)] hover:text-[#fcfaf7]/90",
                      isActive &&
                        "bg-primary text-primary-foreground shadow-subtle hover:bg-primary hover:text-primary-foreground",
                    )
                  }
                >
                  <Icon size={17} strokeWidth={1.6} />
                  <span className="flex-1">{item.label}</span>
                  <span className="font-mono text-[0.6rem] text-[#fcfaf7]/25 transition group-hover:text-[#fcfaf7]/45">
                    {item.number}
                  </span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="relative z-10 border-t border-[rgba(255,255,255,0.10)] px-7 py-5">
          <p className="text-[0.7rem] leading-5 text-[#fcfaf7]/30">数据仅供参考</p>
          <p className="text-[0.7rem] leading-5 text-[#fcfaf7]/30">不构成任何投资建议</p>
        </div>
      </aside>

      <div className="col-start-2 flex min-h-screen min-w-0 flex-col">
        {/* 顶部标题栏：与右侧主区域背景保持一致 */}
        <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-border bg-background px-8 text-foreground">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Dibobo</span>
            <ChevronRight size={14} className="text-muted-foreground" />
            <span className="font-semibold text-foreground">{current.label}</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 border-r border-border pr-5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              行情状态 · 按页面更新
            </div>
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
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
              className="text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <LogOut size={15} /> 退出
            </Button>
          </div>
        </header>

        <main className="flex-1 bg-background p-8 xl:p-10">
          <Outlet />
        </main>

        <footer className="border-t border-border bg-background px-8 py-4 text-center text-[0.7rem] tracking-[0.08em] text-muted-foreground/60">
          DIBOBO · 数据仅供参考，不构成任何投资建议
        </footer>
      </div>
    </div>
  );
}
