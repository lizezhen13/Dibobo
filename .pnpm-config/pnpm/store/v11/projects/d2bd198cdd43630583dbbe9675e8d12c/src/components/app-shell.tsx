import {
  BookOpenText,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  Gauge,
  LineChart,
  LogOut,
  Menu,
  Newspaper,
  Radar,
  Settings,
  Star,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useLogoutMutation, useSessionQuery } from "../features/auth/queries";
import { useDataSourcesQuery } from "../features/settings/queries";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const navigation = [
  { to: "/overview", label: "总览面板", icon: Gauge, number: "01" },
  { to: "/news", label: "财经资讯", icon: Newspaper, number: "02" },
  { to: "/watchlist", label: "自选管理", icon: Star, number: "03" },
  { to: "/portfolios", label: "投资组合", icon: WalletCards, number: "04" },
  { to: "/review", label: "复盘分析", icon: LineChart, number: "05" },
  { to: "/radar", label: "红利雷达", icon: Radar, number: "06" },
  { to: "/calendar", label: "事件日历", icon: CalendarDays, number: "07" },
  { to: "/journals", label: "投资日记", icon: BookOpenText, number: "08" },
  { to: "/settings", label: "系统设置", icon: Settings, number: "09" },
] as const;

export function AppShell() {
  const session = useSessionQuery();
  const logout = useLogoutMutation();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpenAtPath, setMobileNavOpenAtPath] = useState<string | null>(null);
  // 判断是否有已启用的数据源，用于侧边栏底部的接入状态指示
  const dataSources = useDataSourcesQuery();
  const isConnected = dataSources.data?.some((source) => source.is_active) ?? false;
  const current = useMemo(() => navigation.find((item) => location.pathname.startsWith(item.to)) ?? navigation[0], [location.pathname]);
  const isFullBleedRoute = location.pathname === "/calendar" || location.pathname.startsWith("/watchlist/detail/");

  const mobileNavOpen = mobileNavOpenAtPath === location.pathname;
  const closeMobileNav = () => setMobileNavOpenAtPath(null);
  const toggleMobileNav = () => setMobileNavOpenAtPath(mobileNavOpen ? null : location.pathname);

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      navigate("/login", { replace: true });
    } catch {
      // 服务端撤销会话失败时，保留当前视图
    }
  };

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* 侧边栏：暗夜驾驶舱深黑外壳 */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[260px] -translate-x-full flex-col overflow-hidden border-r border-dark-border bg-dark-bg text-dark-fg transition-transform duration-200 lg:translate-x-0",
          mobileNavOpen && "translate-x-0",
        )}
      >
        <div className="relative z-10 flex h-[88px] items-center justify-between gap-3 border-b border-dark-border px-5 lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary font-mono text-base font-semibold text-primary-foreground shadow-subtle">
              D
            </div>
            <div className="min-w-0">
              <p className="font-display text-[1.35rem] tracking-[0.05em]">DIBOBO</p>
              <p className="mt-0.5 truncate font-mono text-[0.6rem] tracking-[0.18em] text-dark-fg/40">PRIVATE WORKBENCH</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-dark-fg/65 hover:bg-white/5 hover:text-dark-fg lg:hidden"
            aria-label="关闭导航菜单"
            onClick={closeMobileNav}
          >
            <X size={18} />
          </Button>
        </div>

        <nav className="relative z-10 flex-1 px-3 py-6" aria-label="主导航">
          <p className="mb-3 px-4 font-mono text-[0.6rem] tracking-[0.18em] text-dark-fg/30">工作区 / WORKSPACE</p>
          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={closeMobileNav}
                  className={({ isActive }) =>
                    cn(
                      "group flex h-11 items-center gap-3 rounded-lg px-4 text-[0.9rem] tracking-wide text-dark-fg/55 transition-all duration-200 hover:bg-[rgba(255,255,255,0.04)] hover:text-dark-fg/90",
                      isActive && "bg-primary/[0.14] font-semibold text-primary hover:bg-primary/[0.14] hover:text-primary",
                    )
                  }
                >
                  <Icon size={17} strokeWidth={1.6} />
                  <span className="flex-1">{item.label}</span>
                  <span className="font-mono text-[0.6rem] text-dark-fg/25 transition group-hover:text-dark-fg/45">{item.number}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="relative z-10 border-t border-dark-border px-7 py-5">
          <div className="flex items-center justify-center gap-2">
            {/* 数据源接入状态指示灯：系统成功/错误语义与行情涨跌色分离。 */}
            <span
              className="size-2 rounded-full"
              style={{
                backgroundColor: isConnected ? "var(--success)" : "var(--danger)",
                boxShadow: `0 0 8px ${isConnected ? "rgba(100,181,134,0.7)" : "rgba(224,112,92,0.7)"}`,
              }}
              aria-hidden
            />
            <p className={cn("text-sm leading-5", isConnected ? "text-success" : "text-danger")}>
              {isConnected ? "已接入数据源" : "未接入数据源"}
            </p>
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[2px] lg:hidden"
          aria-label="关闭导航菜单"
          onClick={closeMobileNav}
        />
      )}

      <div className="flex min-h-screen min-w-0 flex-col lg:col-start-2">
        {/* 顶部标题栏：实底深色，无磨砂模糊 */}
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border bg-background px-4 text-foreground sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 text-base">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-ml-2 lg:hidden"
              aria-label={mobileNavOpen ? "关闭导航菜单" : "打开导航菜单"}
              onClick={toggleMobileNav}
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </Button>
            <span className="text-muted-foreground">Dibobo</span>
            <ChevronRight size={14} className="text-muted-foreground" />
            <span className="truncate font-semibold text-foreground">{current.label}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-5">
            <div className="hidden items-center gap-2.5 text-base text-muted-foreground sm:flex">
              <CircleUserRound size={17} />
              <span className="font-medium text-foreground">{session.data?.user.username}</span>
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

        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 bg-background",
            isFullBleedRoute ? "p-0" : "px-4 py-5 sm:px-6 sm:py-7 lg:p-8 xl:p-10",
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
