import { AlertTriangle, ArrowUpRight, DatabaseZap, RefreshCw, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { IndexCard } from "./index-card";
import { useOverviewQuery } from "./queries";

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-5">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-6 shadow-raised">
          <div className="flex justify-between">
            <div>
              <Skeleton className="h-7 w-28" />
              <Skeleton className="mt-2 h-3.5 w-24" />
            </div>
            <Skeleton className="h-7 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-9 h-10 w-48" />
          <Skeleton className="mt-9 h-px w-full" />
          <Skeleton className="mt-4 h-5 w-36" />
        </div>
      ))}
    </div>
  );
}

export function OverviewPage() {
  const query = useOverviewQuery();

  return (
    <div className="mx-auto w-full max-w-[1500px] animate-enter">
      <div className="mb-8 flex items-end justify-between gap-8">
        <div>
          <p className="eyebrow text-primary/90">MARKET OVERVIEW / 市场总览</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-foreground">
            四个坐标，看清今日市场
          </h1>
          <p className="mt-2.5 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
            固定宽基指数行情，不叠加个人资产，不制造多余判断。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {query.isFetching && !query.isPending && (
            <span className="flex items-center gap-2 text-[0.8rem] text-muted-foreground/60">
              <RefreshCw className="animate-spin" size={13} /> 正在更新
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw size={13} /> 手动刷新
          </Button>
        </div>
      </div>

      {query.data?.data_source.state === "not_configured" && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-r-xl border-l-4 border-primary bg-primary/8 px-5 py-4">
          <div className="flex items-center gap-3">
            <DatabaseZap className="text-primary/90" size={19} />
            <div>
              <p className="text-[0.95rem] font-semibold text-foreground">行情数据源尚未配置</p>
              <p className="mt-1 text-[0.85rem] leading-relaxed text-muted-foreground">完成扶摇或兼容数据源配置后，这里会展示真实指数行情。</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">
              <Settings2 size={13} /> 前往系统设置 <ArrowUpRight size={12} />
            </Link>
          </Button>
        </div>
      )}

      {query.data?.stale && (
        <div className="mb-6 flex items-center gap-3 rounded-r-xl border-l-4 border-primary bg-primary/8 px-5 py-4 text-[0.95rem] leading-relaxed text-muted-foreground">
          <AlertTriangle className="shrink-0 text-primary/90" size={18} />
          数据源暂时不可用，当前仍展示最后一次成功行情；请留意卡片中的原始数据时间。
        </div>
      )}

      {query.data && !["ready", "not_configured"].includes(query.data.data_source.state) && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-r-xl border-l-4 border-market-up bg-market-up/6 px-5 py-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-market-up" size={18} />
            <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{query.data.data_source.message ?? "数据源当前不可用，请检查系统设置"}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">检查数据源</Link>
          </Button>
        </div>
      )}

      {query.isPending ? (
        <OverviewSkeleton />
      ) : query.isError ? (
        <div className="grid min-h-[420px] place-items-center rounded-xl border border-border bg-card text-center shadow-raised">
          <div>
            <AlertTriangle className="mx-auto text-market-up" size={26} />
            <h2 className="mt-4 font-display text-2xl">总览加载失败</h2>
            <p className="mt-2 text-[0.9rem] text-muted-foreground">请检查本地服务状态后重试。</p>
            <Button className="mt-5" onClick={() => void query.refetch()}>
              <RefreshCw size={14} /> 重新加载
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {query.data.indices.map((index, ordinal) => (
            <IndexCard key={index.thscode} data={index} ordinal={ordinal + 1} />
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4 font-mono text-[0.7rem] tracking-[0.1em] text-muted-foreground/60">
        <span>UPSTREAM · {query.data?.data_source.name ?? "NOT CONNECTED"}</span>
        <span>{query.data?.polling_enabled ? `交易时段每 ${query.data.refresh_seconds} 秒更新` : "非交易时段不连续轮询"}</span>
      </div>
    </div>
  );
}

