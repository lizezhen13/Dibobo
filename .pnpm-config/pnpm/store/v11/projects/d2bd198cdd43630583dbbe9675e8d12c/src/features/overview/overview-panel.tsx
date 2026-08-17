import { AlertTriangle, Clock3, DatabaseZap, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "../../components/ui/card";
import { cn } from "../../lib/utils";

function formatClock(value: string | null | undefined) {
  if (!value) return "等待数据";
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "等待数据";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

interface OverviewPanelProps {
  title: string;
  label: string;
  updatedAt?: string | null;
  isFetching?: boolean;
  stale?: boolean;
  toolbar?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function OverviewPanel({
  title,
  label,
  updatedAt,
  isFetching = false,
  stale = false,
  toolbar,
  className,
  bodyClassName,
  children,
}: OverviewPanelProps) {
  return (
    <Card className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-lg shadow-subtle hover:shadow-raised", className)}>
      <div className="flex min-h-[52px] shrink-0 items-center justify-between gap-4 border-b border-border px-5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate text-base font-semibold tracking-normal text-foreground">{title}</h2>
          <span className="hidden font-mono text-[11px] text-muted-foreground/55 sm:inline">{label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div
            className={cn("flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground/70", stale && "text-warning")}
            title={stale ? "当前展示最后一次成功数据" : "卡片数据更新时间"}
          >
            {isFetching ? <LoaderCircle className="animate-spin" size={12} /> : <Clock3 size={12} />}
            <span>{isFetching ? "同步中" : stale ? `缓存 ${formatClock(updatedAt)}` : formatClock(updatedAt)}</span>
          </div>
          {toolbar}
        </div>
      </div>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </Card>
  );
}

type PanelStateKind = "loading" | "error" | "unavailable" | "empty";

export function PanelState({ kind, message, className }: { kind: PanelStateKind; message?: string | null; className?: string }) {
  const Icon = kind === "loading" ? LoaderCircle : kind === "unavailable" ? DatabaseZap : AlertTriangle;
  const title =
    kind === "loading" ? "正在读取数据" : kind === "unavailable" ? "数据源不可用" : kind === "empty" ? "暂无可展示数据" : "数据加载失败";

  return (
    <div className={cn("grid min-h-[220px] place-items-center px-6 text-center", className)}>
      <div>
        <Icon
          className={cn(
            "mx-auto text-muted-foreground/55",
            kind === "loading" && "animate-spin text-primary",
            kind === "error" && "text-market-up",
          )}
          size={22}
        />
        <p className="mt-3 text-[15px] font-medium text-foreground/85">{title}</p>
        {message && <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}
