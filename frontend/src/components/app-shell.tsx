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
      // Keep the current session visible when the server could not revoke it.
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-[248px_minmax(0,1fr)] bg-background">
      {/* 侧边栏：深色磨砂玻璃外壳 */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[248px] flex-col overflow-hidden border-r border-shell-border bg-shell text-paper backdrop-blur-md">
        <div className="relative z-10 flex h-[92px] items-center gap-3 border-b border-white/10 px-7">
          <div className="grid size-9 place-items-center rounded-md border border-primary/70 bg-primary/10 font-mono text-sm text-primary shadow-subtle">D</div>
          <div>
            <p className="font-display text-xl tracking-[.06em]">DIBOBO</p>
            <p className="mt-0.5 text-[9px] tracking-[.19em] text-paper/40">PRIVATE WORKBENCH</p>
          </div>
        </div>

        <nav className="relative z-10 flex-1 px-3 py-7" aria-label="主导航">
          <p className="mb-3 px-4 text-[9px] tracking-[.2em] text-paper/30">工作区 / WORKSPACE</p>
          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "group flex h-11 items-center gap-3 rounded-md px-4 text-[13px] tracking-wide text-paper/55 transition hover:bg-white/[0.06] hover:text-paper/90",
                      isActive && "bg-primary text-primary-foreground shadow-subtle",
                    )
                  }
                >
                  <Icon size={16} strokeWidth={1.65} />
                  <span className="flex-1">{item.label}</span>
                  <span className="font-mono text-[9px] text-paper/22 transition group-hover:text-paper/45">{item.number}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="relative z-10 border-t border-white/10 px-7 py-5">
          <p className="text-[10px] leading-5 text-paper/30">数据仅供参考</p>
          <p className="text-[10px] leading-5 text-paper/30">不构成任何投资建议</p>
        </div>
      </aside>

      <div className="col-start-2 flex min-h-screen min-w-0 flex-col">
        {/* 顶部标题栏：深色磨砂玻璃外壳 */}
        <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-shell-border bg-shell px-8 text-paper backdrop-blur-md">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-paper/45">Dibobo</span>
            <ChevronRight size={13} className="text-paper/45" />
            <span className="font-semibold text-paper/95">{current.label}</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 border-r border-white/10 pr-5 text-xs text-paper/50">
              <span className="size-1.5 rounded-full bg-primary" /> 行情状态 · 按页面更新
            </div>
            <div className="flex items-center gap-2.5 text-sm text-paper/50">
              <CircleUserRound size={16} />
              <span className="font-medium text-paper/90">{session.data?.user.username}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleLogout()}
              disabled={logout.isPending}
              aria-label="退出登录"
              className="text-paper/70 hover:bg-white/[0.06] hover:text-paper"
            >
              <LogOut size={14} /> 退出
            </Button>
          </div>
        </header>

        <main className="flex-1 bg-background p-8 xl:p-10">
          <Outlet />
        </main>
        <footer className="border-t border-border bg-background px-8 py-4 text-center text-[10px] tracking-[.1em] text-muted-foreground/60">
          DIBOBO · 数据仅供参考，不构成任何投资建议
        </footer>
      </div>
    </div>
  );
}

