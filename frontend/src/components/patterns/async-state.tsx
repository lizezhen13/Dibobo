import { AlertTriangle, Inbox, LoaderCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export function LoadingState({ label = "正在加载…", className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn("flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground", className)}
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="animate-spin text-primary" size={16} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-h-56 place-items-center rounded-xl border border-dashed border-border bg-card/35 px-6 text-center",
        className,
      )}
    >
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-primary/20 bg-primary/6 text-primary/80">
          <Icon size={21} aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-display text-xl tracking-tight text-foreground">{title}</h2>
        {description && <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-muted-foreground">{description}</p>}
        {action && <div className="mt-5 flex justify-center gap-3">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({
  title = "加载失败",
  description = "请检查本地服务状态后重试。",
  onRetry,
  retryLabel = "重试",
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("grid min-h-56 place-items-center rounded-xl border border-border bg-card text-center shadow-raised", className)}
      role="alert"
    >
      <div>
        <AlertTriangle className="mx-auto text-danger" size={24} aria-hidden="true" />
        <h2 className="mt-4 font-display text-xl tracking-tight text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {onRetry && (
          <Button className="mt-5" variant="outline" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function InlineAlert({
  children,
  tone = "danger",
  className,
}: {
  children: ReactNode;
  tone?: "danger" | "warning" | "info" | "success";
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-lg border-l-4 px-4 py-3 text-sm",
        tone === "danger" && "border-danger bg-danger/10 text-danger",
        tone === "warning" && "border-warning bg-warning/10 text-warning",
        tone === "info" && "border-info bg-info/10 text-info",
        tone === "success" && "border-success bg-success/10 text-success",
        className,
      )}
    >
      {children}
    </div>
  );
}
