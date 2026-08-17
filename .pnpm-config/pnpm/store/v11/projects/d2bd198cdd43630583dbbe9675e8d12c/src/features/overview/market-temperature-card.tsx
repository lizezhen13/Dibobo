import type { UseQueryResult } from "@tanstack/react-query";

import { cn } from "../../lib/utils";
import { OverviewPanel, PanelState } from "./overview-panel";
import { clampTemperature, temperatureTone } from "./market-temperature-utils";
import type { OverviewMarketTemperature } from "./types";

function indexLabel(kind: "valuation" | "sentiment", value: number) {
  if (kind === "valuation") {
    if (value < 20) return "低估";
    if (value < 40) return "偏低";
    if (value < 60) return "适中";
    if (value < 80) return "偏高";
    return "极高";
  }
  if (value < 20) return "低迷";
  if (value < 40) return "偏弱";
  if (value < 60) return "平稳";
  if (value < 80) return "高涨";
  return "极强";
}

function indexTone(value: number) {
  if (value >= 80) return "text-market-up";
  if (value >= 60) return "text-warning";
  if (value <= 35) return "text-market-down";
  return "text-muted-foreground";
}

export function TemperatureBullet({ value, description }: { value: number; description?: string | null }) {
  const temperature = clampTemperature(value);
  const tone = temperatureTone(temperature);
  const markerTransform = temperature >= 96 ? "translateX(-100%)" : temperature <= 4 ? "translateX(0)" : "translateX(-50%)";

  return (
    <div className="w-full min-w-0" role="img" aria-label={`市场温度 ${temperature} 度，${tone.label}，区间 ${tone.range}`}>
      <div className="mb-3 flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 items-center gap-[18px]">
          <span className="font-mono text-[1.9rem] font-semibold leading-none tracking-[-0.08em]" style={{ color: tone.accent }}>
            {temperature}
          </span>
          <span
            className="rounded-sm border-2 px-1.5 py-0.5 font-mono text-[15px] font-semibold leading-none"
            style={{ borderColor: `${tone.accent}66`, color: tone.accent, backgroundColor: `${tone.accent}14` }}
          >
            {tone.label}
          </span>
        </div>
        <p className="min-w-0 flex-1 truncate text-right text-[15px] font-semibold leading-5" style={{ color: tone.accent }} title={description ?? tone.description}>
          {description || tone.description}
        </p>
      </div>

      <div className="relative pt-4">
        <div className="relative h-8 overflow-visible rounded-[3px] border border-border/80 bg-muted/20">
          <div
            className="absolute inset-[4px] rounded-[1px] transition-[background,box-shadow] duration-300"
            style={{
              background: "linear-gradient(90deg, #4d9bc1 0%, #77c39d 35%, #f1b057 60%, #f05d4f 80%, #bb4245 100%)",
              boxShadow: `0 0 24px ${tone.glow}`,
            }}
            aria-hidden="true"
          />
          <div className="absolute inset-y-1 left-[35%] w-px bg-white/45" aria-hidden="true" />
          <div className="absolute inset-y-1 left-[60%] w-px bg-white/45" aria-hidden="true" />
          <div className="absolute inset-y-1 left-[80%] w-px bg-white/55" aria-hidden="true" />
          <div
            className="absolute inset-y-1 w-14 -translate-x-1/2 rounded-full opacity-30 blur-md transition-[left,background-color] duration-300"
            style={{ left: `${temperature}%`, backgroundColor: tone.accent }}
            aria-hidden="true"
          />
        </div>

        <div className="absolute top-0" style={{ left: `${temperature}%`, transform: markerTransform }}>
          <span className="block whitespace-nowrap font-mono text-[10px] font-medium" style={{ color: tone.accent }}>
            {temperature}
          </span>
          <span className="mx-auto mt-1 block h-10 w-0.5" style={{ backgroundColor: tone.accent, boxShadow: `0 0 10px ${tone.glow}` }} />
        </div>
      </div>

      <div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground/60">
        <span>0</span><span>35</span><span>60</span><span>80</span><span>100</span>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/70">
        <span>低迷</span><span>平稳</span><span>偏热</span><span>过热</span>
      </div>
    </div>
  );
}

function TemperatureMetric({ kind, label, value }: { kind: "valuation" | "sentiment"; label: string; value: number }) {
  return (
    <div className="min-w-0 text-center" title={`${label}指数 ${value}/100`}>
      <p className="text-base font-medium text-foreground/80">{label}</p>
      <p className={cn("mt-1 truncate text-base font-semibold", indexTone(value))}>{indexLabel(kind, value)}</p>
      <p className="mt-0.5 font-mono text-base text-muted-foreground/55">{value}/100</p>
    </div>
  );
}

export function MarketTemperatureCard({
  query,
}: {
  query: UseQueryResult<OverviewMarketTemperature, Error>;
}) {
  const data = query.data;

  return (
    <OverviewPanel
      title="市场温度"
      label="MARKET TEMPERATURE"
      updatedAt={data?.updated_at}
      stale={data?.stale}
      isFetching={query.isFetching}
      className="min-h-[330px]"
    >
      {query.isPending ? (
        <PanelState kind="loading" />
      ) : query.isError ? (
        <PanelState kind="error" message="Longbridge 市场温度暂时无法加载" />
      ) : !data ? (
        <PanelState kind="error" message="Longbridge 未返回有效的市场温度数据" />
      ) : data.data_source.state !== "ready" ? (
        <PanelState kind="unavailable" message={data.data_source.message ?? "请先配置并启用 Longbridge 数据源"} />
      ) : data.temperature === null || data.valuation === null || data.sentiment === null ? (
        <PanelState kind="empty" message="Longbridge 尚未返回完整的市场温度指标" />
      ) : (
        <div className="flex h-full min-h-0 flex-col overflow-hidden px-4 pb-4 pt-1">
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-h-0 items-center justify-center overflow-hidden">
              <TemperatureBullet value={data.temperature} description={data.description} />
            </div>
          </div>
          <div className="mt-2 min-h-[82px] shrink-0 border-t border-border/70 pt-3">
            <div className="grid h-full grid-cols-2 items-center divide-x divide-border/70">
              <div className="flex h-full items-center justify-center pr-4">
                <TemperatureMetric kind="valuation" label="估值" value={data.valuation} />
              </div>
              <div className="flex h-full items-center justify-center pl-4">
                <TemperatureMetric kind="sentiment" label="情绪" value={data.sentiment} />
              </div>
            </div>
          </div>
        </div>
      )}
    </OverviewPanel>
  );
}
