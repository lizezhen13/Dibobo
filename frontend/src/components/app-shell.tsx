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
    <div className="grid min-h-screen grid-cols-[248px_minmax(0,1fr)] bg-paper-deep">
      <aside className="fine-noise fixed inset-y-0 left-0 z-20 flex w-[248px] flex-col overflow-hidden bg-ink text-paper">
        <div className="relative z-10 flex h-[92px] items-center gap-3 border-b border-paper/10 px-7">
          <div className="grid size-9 place-items-center border border-accent/75 font-mono text-sm text-accent">D</div>
          <div>
            <p className="font-display text-xl tracking-[.08em]">DIBOBO</p>
            <p className="mt-0.5 text-[9px] tracking-[.19em] text-paper/35">PRIVATE WORKBENCH</p>
          </div>
        </div>

        <nav className="relative z-10 flex-1 px-3 py-7" aria-label="主导航">
          <p className="mb-3 px-4 text-[9px] tracking-[.2em] text-paper/28">工作区 / WORKSPACE</p>
          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "group flex h-11 items-center gap-3 rounded-[3px] px-4 text-[13px] tracking-wide text-paper/50 transition hover:bg-paper/6 hover:text-paper/85",
                      isActive && "bg-paper/9 text-paper shadow-[inset_2px_0_0_#c58b32]",
                    )
                  }
                >
                  <Icon size={16} strokeWidth={1.65} />
                  <span className="flex-1">{item.label}</span>
                  <span className="font-mono text-[9px] text-paper/22 transition group-hover:text-paper/40">{item.number}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="relative z-10 border-t border-paper/10 px-7 py-5">
          <p className="text-[10px] leading-5 text-paper/28">数据仅供参考</p>
          <p className="text-[10px] leading-5 text-paper/28">不构成任何投资建议</p>
        </div>
      </aside>

      <div className="col-start-2 flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-line bg-paper/95 px-8 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-faint">Dibobo</span>
            <ChevronRight size={13} className="text-ink-faint" />
            <span className="font-semibold text-ink">{current.label}</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 border-r border-line pr-5 text-xs text-ink-muted">
              <span className="size-1.5 rounded-full bg-accent" /> 行情状态 · 按页面更新
            </div>
            <div className="flex items-center gap-2.5 text-sm text-ink-muted">
              <CircleUserRound size={16} />
              <span className="font-medium text-ink">{session.data?.user.username}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleLogout()}
              disabled={logout.isPending}
              aria-label="退出登录"
            >
              <LogOut size={14} /> 退出
            </Button>
          </div>
        </header>

        <main className="flex-1 p-8 xl:p-10">
          <Outlet />
        </main>
        <footer className="border-t border-line px-8 py-4 text-center text-[10px] tracking-[.1em] text-ink-faint">
          DIBOBO · 数据仅供参考，不构成任何投资建议
        </footer>
      </div>
    </div>
  );
}

