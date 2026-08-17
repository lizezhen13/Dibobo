import { ChevronRight, Clock3, Star, Tag, X } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "../../components/ui/sheet";
import { cn } from "../../lib/utils";
import { CATEGORY_META, dateLabel } from "./calendar-meta";
import type { CalendarEvent } from "./types";

function timeLabel(event: CalendarEvent) {
  if (event.all_day || !event.event_datetime) return "全天";
  const parsed = new Date(event.event_datetime);
  if (Number.isNaN(parsed.getTime())) return "时间待定";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function timestampLabel(value: string | null) {
  if (!value) return "尚未同步";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function eventSubtitle(event: CalendarEvent) {
  if (event.category === "macro") {
    return [event.country_or_region, event.period].filter(Boolean).join(" · ") || "宏观经济数据";
  }
  if (event.category === "closed") {
    return [event.market, event.country_or_region].filter(Boolean).join(" · ") || "交易市场安排";
  }
  return [event.symbol, event.market].filter(Boolean).join(" · ") || "公司事件";
}

function valuePairs(event: CalendarEvent) {
  return [
    ["实际", event.actual_value],
    ["预期", event.forecast_value],
    ["前值", event.previous_value],
  ].filter((pair): pair is [string, string] => Boolean(pair[1]));
}

const CALENDAR_UNIT_ALIASES: Record<string, string> = {
  percent: "%",
  percentage: "%",
  pct: "%",
  "％": "%",
  百分比: "%",
  百分率: "%",
};

const CALENDAR_UNIT_SUFFIXES = [
  "美元/盎司",
  "美元/桶",
  "美元/股",
  "港元/股",
  "人民币/股",
  "新加坡元",
  "瑞士法郎",
  "人民币",
  "港元",
  "美元",
  "欧元",
  "英镑",
  "日元",
  "韩元",
  "澳元",
  "加元",
  "US$",
  "HK$",
  "USD",
  "HKD",
  "CNY",
  "EUR",
  "GBP",
  "JPY",
  "KRW",
  "AUD",
  "CAD",
  "指数",
  "百分点",
  "‰",
  "%",
  "点",
  "元",
  "$",
];

function normalizeCalendarUnit(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().replaceAll("％", "%");
  return normalized ? (CALENDAR_UNIT_ALIASES[normalized.toLowerCase()] ?? normalized) : null;
}

function inferUnitFromValue(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().replaceAll("％", "%");
  if (!normalized) return null;
  return (
    [...CALENDAR_UNIT_SUFFIXES]
      .sort((left, right) => right.length - left.length)
      .find((suffix) => normalized.endsWith(suffix) && normalized.slice(0, -suffix.length).trim()) ?? null
  );
}

function eventUnit(event: CalendarEvent) {
  return (
    normalizeCalendarUnit(event.unit) ??
    valuePairs(event)
      .map(([, value]) => inferUnitFromValue(value))
      .find(Boolean) ??
    null
  );
}

function valueWithoutUnit(value: string | null, unit: string | null) {
  if (!value) return value;
  const normalizedValue = value.trim().replaceAll("％", "%");
  const candidates = [unit, ...CALENDAR_UNIT_SUFFIXES]
    .map((candidate) => normalizeCalendarUnit(candidate))
    .filter((candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index)
    .sort((left, right) => right.length - left.length);

  for (const candidate of candidates) {
    if (normalizedValue.endsWith(candidate)) {
      const stripped = normalizedValue.slice(0, -candidate.length).trim();
      if (stripped) return stripped;
    }
    if (normalizedValue.startsWith(candidate)) {
      const stripped = normalizedValue.slice(candidate.length).trim();
      if (stripped) return stripped;
    }
  }
  return value;
}

function EventGlyph({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  const Icon = CATEGORY_META[event.category].icon;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-[10px] border bg-black/20",
        compact ? "size-7" : "size-10 rounded-xl",
        CATEGORY_META[event.category].chip,
      )}
    >
      <Icon size={compact ? 14 : 18} strokeWidth={1.7} />
    </span>
  );
}

function ScopeTags({ event }: { event: CalendarEvent }) {
  if (event.scope_tags.length === 0) return null;
  return (
    <span className="flex items-center gap-1.5">
      {event.scope_tags.map((tag) => (
        <span
          key={tag}
          className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-primary"
        >
          {tag === "watchlist" ? "自选" : "持仓"}
        </span>
      ))}
    </span>
  );
}

function Stars({ importance }: { importance: number | null }) {
  if (!importance) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-warning" aria-label={`${importance} 星重要性`}>
      {Array.from({ length: importance }, (_, index) => (
        <Star key={index} size={11} fill="currentColor" strokeWidth={1.3} />
      ))}
    </span>
  );
}

export function EventCard({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const isCompanyEvent = event.category !== "macro" && event.category !== "closed";
  const values = valuePairs(event);
  const unit = eventUnit(event);
  return (
    <button
      type="button"
      onClick={onClick}
      className="calendar-event-card group flex w-full items-start gap-2.5 rounded-xl border border-border/80 bg-background/35 p-2.5 text-left transition duration-200 hover:border-primary/40 hover:bg-secondary/70 hover:shadow-subtle focus-visible:ring-2 focus-visible:ring-primary sm:p-3"
    >
      <EventGlyph event={event} compact />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-[0.92rem] font-semibold tracking-tight text-foreground sm:text-[0.98rem]">
              {isCompanyEvent && event.security_name ? event.security_name : event.title}
            </span>
            <span className="mt-0.5 block truncate text-[0.84rem] text-muted-foreground">
              {isCompanyEvent && event.security_name ? `${event.symbol ?? ""} · ${event.title}` : eventSubtitle(event)}
            </span>
          </span>
          <span className="shrink-0 pt-0.5 font-mono text-[0.72rem] text-muted-foreground">{timeLabel(event)}</span>
        </span>
        <span className="mt-2 flex min-h-4 flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.80rem] text-muted-foreground">
          <ScopeTags event={event} />
          <Stars importance={event.category === "closed" ? null : event.importance} />
          {event.category === "macro" && values.length > 0 ? (
            <>
              <span className="flex min-w-0 flex-wrap gap-x-2">
                {values.map(([label, value]) => (
                  <span key={label}>
                    {label} <b className="font-mono font-medium text-foreground">{valueWithoutUnit(value, unit)}</b>
                  </span>
                ))}
              </span>
            </>
          ) : null}
          {event.category === "closed" && event.details.closure_type ? <span>{String(event.details.closure_type)}</span> : null}
        </span>
      </span>
      <ChevronRight
        size={15}
        className="mt-3 shrink-0 text-muted-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 border-b border-border/60 py-3 last:border-0">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="break-words text-right text-[13px] text-foreground">{String(value)}</dd>
    </div>
  );
}

export function EventDrawer({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const meta = CATEGORY_META[event.category];
  const unit = eventUnit(event);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" showClose={false} aria-describedby="calendar-event-drawer-description" className="calendar-drawer">
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div className="flex items-start gap-3">
            <EventGlyph event={event} />
            <div>
              <p className={cn("font-mono text-[0.68rem] tracking-[0.18em]", meta.tone)}>{meta.eyebrow}</p>
              <SheetTitle id="calendar-event-drawer-title" className="mt-1 text-xl font-semibold">
                {event.category !== "macro" && event.category !== "closed" && event.security_name ? event.security_name : event.title}
              </SheetTitle>
              <SheetDescription id="calendar-event-drawer-description" className="mt-1 text-sm text-muted-foreground">
                {eventSubtitle(event)}
              </SheetDescription>
            </div>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="关闭详情" className="-mr-2 -mt-2">
              <X size={17} />
            </Button>
          </SheetClose>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="rounded-2xl border border-border bg-background/45 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 size={14} className={meta.tone} />
                {dateLabel(event.event_date)}
              </span>
              <span className="font-mono text-sm text-foreground">{timeLabel(event)}</span>
            </div>
            <p className="mt-3 text-[0.95rem] leading-7 text-foreground/90">{event.content || event.title}</p>
          </div>

          <dl className="mt-5">
            <DetailRow label="事件类型" value={event.title} />
            <DetailRow label="市场" value={event.market} />
            <DetailRow label="国家/地区" value={event.country_or_region} />
            <DetailRow label="股票代码" value={event.symbol} />
            <DetailRow label="所属期间" value={event.period} />
            <DetailRow label="盘前/盘后" value={event.financial_market_time} />
            <DetailRow label="重要性" value={event.importance ? `${event.importance} 星` : null} />
            <DetailRow label="实际值" value={valueWithoutUnit(event.actual_value, unit)} />
            <DetailRow label="预测值" value={valueWithoutUnit(event.forecast_value, unit)} />
            <DetailRow label="前值" value={valueWithoutUnit(event.previous_value, unit)} />
            <DetailRow label="修正值" value={valueWithoutUnit(event.revised_value, unit)} />
            <DetailRow label="单位" value={unit} />
            <DetailRow label="币种" value={event.currency} />
            {Object.entries(event.details).map(([key, value]) => (
              <DetailRow key={key} label={detailLabel(key)} value={value} />
            ))}
          </dl>

          {event.scope_tags.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/[0.06] p-4">
              <div className="flex items-center gap-2 text-sm text-primary">
                <Tag size={14} /> 关注范围
              </div>
              <div className="mt-3 flex gap-2">
                {event.scope_tags.map((tag) => (
                  <Badge key={tag} variant="neutral" className="border-primary/20 bg-primary/10 text-primary">
                    {tag === "watchlist" ? "自选" : "持仓"}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="border-t border-border px-6 py-4 text-[0.74rem] text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <span>来源：{event.source_name}</span>
            <span>同步于 {timestampLabel(event.last_synced_at)}</span>
          </div>
          <p className="mt-1">时间按 {event.timezone} 展示；未提供具体时刻时按全天事件处理。</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function detailLabel(key: string) {
  const labels: Record<string, string> = {
    report_period: "报告期",
    report_time: "财报时段",
    eps: "EPS",
    revenue: "营收",
    dividend_amount: "分红金额",
    ex_date: "除息日",
    record_date: "登记日",
    pay_date: "派息日",
    action: "动作",
    ratio: "比例",
    closure_name: "休市名称",
    closure_type: "休市类型",
  };
  return labels[key] ?? key;
}
