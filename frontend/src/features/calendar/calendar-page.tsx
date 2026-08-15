import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coins,
  Globe2,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
  Star,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ApiError } from "../../lib/api";
import { cn } from "../../lib/utils";
import {
  useCalendarEventsQuery,
  useCalendarFiltersQuery,
  useRefreshCalendarMutation,
} from "./queries";
import type {
  CalendarCategory,
  CalendarEvent,
  CalendarQueryParams,
  CalendarScope,
} from "./types";

const CATEGORY_META: Record<
  CalendarCategory,
  { label: string; eyebrow: string; icon: LucideIcon; tone: string; chip: string }
> = {
  macro: {
    label: "经济数据",
    eyebrow: "MACRO RELEASES",
    icon: Globe2,
    tone: "text-sky-300",
    chip: "border-sky-300/20 bg-sky-300/10 text-sky-200",
  },
  earnings: {
    label: "财报",
    eyebrow: "EARNINGS",
    icon: BarChart3,
    tone: "text-violet-300",
    chip: "border-violet-300/20 bg-violet-300/10 text-violet-200",
  },
  dividend: {
    label: "分红",
    eyebrow: "DIVIDENDS",
    icon: Coins,
    tone: "text-emerald-300",
    chip: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
  },
  split: {
    label: "拆合",
    eyebrow: "CORPORATE ACTIONS",
    icon: ArrowLeftRight,
    tone: "text-amber-300",
    chip: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  },
  closed: {
    label: "休市",
    eyebrow: "MARKET CLOSURES",
    icon: CalendarOff,
    tone: "text-rose-300",
    chip: "border-rose-300/20 bg-rose-300/10 text-rose-200",
  },
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const DEFAULT_MARKETS = ["US", "HK", "SH", "SZ"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1);
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(month: Date) {
  const start = monthStart(month);
  const firstCell = addDays(start, -start.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(firstCell, index));
}

function isSameDate(left: Date, right: Date) {
  return toIsoDate(left) === toIsoDate(right);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(date);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(fromIsoDate(value));
}

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

function EventCard({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const isCompanyEvent = event.category !== "macro" && event.category !== "closed";
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
          <span className="shrink-0 pt-0.5 font-mono text-[0.72rem] text-muted-foreground">
            {timeLabel(event)}
          </span>
        </span>
        <span className="mt-2 flex min-h-4 flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.80rem] text-muted-foreground">
          <ScopeTags event={event} />
          <Stars importance={event.category === "closed" ? null : event.importance} />
          {event.category === "macro" && valuePairs(event).length > 0 ? (
            <span className="flex min-w-0 flex-wrap gap-x-2">
              {valuePairs(event).map(([label, value]) => (
                <span key={label}>
                  {label} <b className="font-mono font-medium text-foreground">{value}</b>
                </span>
              ))}
            </span>
          ) : null}
          {event.category === "closed" && event.details.closure_type ? (
            <span>{String(event.details.closure_type)}</span>
          ) : null}
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

function EventDrawer({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const meta = CATEGORY_META[event.category];
  useEffect(() => {
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="关闭事件详情"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-event-drawer-title"
        className="calendar-drawer relative flex h-full w-[min(480px,100vw)] flex-col border-l border-border bg-card shadow-dialog"
      >
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div className="flex items-start gap-3">
            <EventGlyph event={event} />
            <div>
              <p className={cn("font-mono text-[0.68rem] tracking-[0.18em]", meta.tone)}>{meta.eyebrow}</p>
              <h2 id="calendar-event-drawer-title" className="mt-1 text-xl font-semibold">
                {event.category !== "macro" && event.category !== "closed" && event.security_name
                  ? event.security_name
                  : event.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{eventSubtitle(event)}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭详情" className="-mr-2 -mt-2">
            <X size={17} />
          </Button>
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
            <p className="mt-3 text-[0.95rem] leading-7 text-foreground/90">
              {event.content || event.title}
            </p>
          </div>

          <dl className="mt-5">
            <DetailRow label="事件类型" value={event.title} />
            <DetailRow label="市场" value={event.market} />
            <DetailRow label="国家/地区" value={event.country_or_region} />
            <DetailRow label="股票代码" value={event.symbol} />
            <DetailRow label="所属期间" value={event.period} />
            <DetailRow label="盘前/盘后" value={event.financial_market_time} />
            <DetailRow label="重要性" value={event.importance ? `${event.importance} 星` : null} />
            <DetailRow label="实际值" value={event.actual_value} />
            <DetailRow label="预测值" value={event.forecast_value} />
            <DetailRow label="前值" value={event.previous_value} />
            <DetailRow label="修正值" value={event.revised_value} />
            <DetailRow label="单位" value={event.unit} />
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
      </aside>
    </div>
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

function CalendarEmptyState({ date }: { date: string }) {
  return (
    <div className="grid h-full min-h-[220px] place-items-center rounded-xl border border-dashed border-border/80 bg-card/30 px-6 text-center">
      <div>
        <CalendarDays size={28} className="mx-auto text-muted-foreground/50" strokeWidth={1.4} />
        <p className="mt-4 text-sm font-medium text-foreground">{dateLabel(date)}之后暂无事件</p>
        <p className="mt-1 text-sm text-muted-foreground">切换分类、月份或筛选范围试试</p>
      </div>
    </div>
  );
}

export function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const todayIso = toIsoDate(today);
  const [category, setCategory] = useState<CalendarCategory>("macro");
  const [month, setMonth] = useState(() => monthStart(today));
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [markets, setMarkets] = useState<string[]>([]);
  const [scope, setScope] = useState<CalendarScope>("all");
  const [importance, setImportance] = useState<number[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const queryParams = useMemo<CalendarQueryParams>(() => {
    const start = monthStart(month);
    const end = addDays(monthEnd(month), 45);
    return {
      category,
      from: toIsoDate(start),
      to: toIsoDate(end),
      markets,
      scope: category === "macro" || category === "closed" ? "all" : scope,
      importance: category === "closed" ? [] : importance,
    };
  }, [category, importance, markets, month, scope]);

  const eventsQuery = useCalendarEventsQuery(queryParams);
  const filtersQuery = useCalendarFiltersQuery(category);
  const refreshMutation = useRefreshCalendarMutation();
  const meta = CATEGORY_META[category];
  const calendarDays = useMemo(() => buildCalendarDays(month), [month]);

  useEffect(() => {
    setMarkets([]);
    setImportance([]);
    setScope("all");
    setSelectedEvent(null);
  }, [category]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of eventsQuery.data?.items ?? []) {
      const current = map.get(event.event_date) ?? [];
      current.push(event);
      map.set(event.event_date, current);
    }
    return map;
  }, [eventsQuery.data?.items]);

  const timelineGroups = useMemo(
    () => (eventsQuery.data?.groups ?? []).filter((group) => group.event_date >= selectedDate),
    [eventsQuery.data?.groups, selectedDate],
  );

  const filterCount = markets.length + importance.length + (scope !== "all" ? 1 : 0);
  const visibleMarkets = filtersQuery.data?.markets ?? DEFAULT_MARKETS;
  const errorMessage = eventsQuery.error instanceof ApiError ? eventsQuery.error.message : "事件日历暂时无法加载";

  const selectDay = (day: Date) => {
    if (day.getMonth() !== month.getMonth()) setMonth(monthStart(day));
    setSelectedDate(toIsoDate(day));
  };

  const goToToday = () => {
    setMonth(monthStart(today));
    setSelectedDate(todayIso);
  };

  const shiftMonth = (amount: number) => {
    const next = addMonths(month, amount);
    setMonth(next);
    setSelectedDate(toIsoDate(next));
  };

  const toggleMarket = (market: string) => {
    setMarkets((current) => (current.includes(market) ? current.filter((item) => item !== market) : [...current, market]));
  };

  const toggleImportance = (value: number) => {
    setImportance((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  };

  const refresh = () => {
    void refreshMutation.mutateAsync(queryParams);
  };

  return (
    <section className="calendar-page -m-8 flex min-h-0 flex-col overflow-hidden bg-background xl:-m-10">
      <div className="calendar-toolbar shrink-0 border-b border-border bg-background px-5 py-3 xl:px-7">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="事件类型">
          {(Object.keys(CATEGORY_META) as CalendarCategory[]).map((item) => {
            const itemMeta = CATEGORY_META[item];
            const Icon = itemMeta.icon;
            const active = category === item;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(item)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition",
                  active
                    ? "border-primary/50 bg-primary text-primary-foreground shadow-subtle"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                <Icon size={14} /> {itemMeta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="calendar-content flex min-h-0 flex-1 flex-col px-5 py-4 xl:px-7 xl:py-5">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              今天
            </Button>
            <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="上个月">
              <ChevronLeft size={16} />
            </Button>
            <div className="min-w-[128px] text-center text-xl font-semibold tracking-tight">{monthLabel(month)}</div>
            <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="下个月">
              <ChevronRight size={16} />
            </Button>
          </div>
          <div className="relative flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn("text-[12px]", filterCount > 0 && "border-primary/50 text-primary")}
            >
              <SlidersHorizontal size={14} /> 筛选
              {filterCount > 0 ? <span className="grid size-4 place-items-center rounded-full bg-primary text-[0.7rem] text-primary-foreground">{filterCount}</span> : null}
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshMutation.isPending} className="text-[12px]">
              {refreshMutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              刷新
            </Button>

            {filtersOpen ? (
              <div className="absolute right-0 top-11 z-30 w-[min(360px,calc(100vw-48px))] rounded-2xl border border-border bg-card p-4 shadow-dialog">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">筛选事件</p>
                    <p className="mt-0.5 text-[0.78rem] text-muted-foreground">条件会合并应用到当前分类</p>
                  </div>
                  <button type="button" onClick={() => setFiltersOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="关闭筛选">
                    <X size={15} />
                  </button>
                </div>
                <div className="mt-5">
                  <p className="mb-2 font-mono text-[0.7rem] tracking-[0.16em] text-muted-foreground">MARKET</p>
                  <div className="flex flex-wrap gap-2">
                    {visibleMarkets.map((market) => (
                      <button
                        key={market}
                        type="button"
                        onClick={() => toggleMarket(market)}
                        className={cn(
                          "rounded-lg border px-2.5 py-1.5 font-mono text-[0.78rem] transition",
                          (markets.length === 0 || markets.includes(market))
                            ? "border-primary/50 bg-primary/15 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {market}
                      </button>
                    ))}
                  </div>
                </div>
                {category !== "macro" && category !== "closed" ? (
                  <div className="mt-5">
                    <p className="mb-2 font-mono text-[0.7rem] tracking-[0.16em] text-muted-foreground">SCOPE</p>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["all", "全部关注"],
                        ["watchlist", "自选"],
                        ["holding", "持仓"],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setScope(value)}
                          className={cn(
                            "rounded-lg border px-2.5 py-1.5 text-[0.78rem] transition",
                            scope === value ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {category !== "closed" ? (
                  <div className="mt-5">
                    <p className="mb-2 font-mono text-[0.7rem] tracking-[0.16em] text-muted-foreground">IMPORTANCE</p>
                    <div className="flex gap-2">
                      {[1, 2, 3].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => toggleImportance(value)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[0.78rem] transition",
                            importance.includes(value) ? "border-warning/50 bg-warning/10 text-warning" : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Star size={11} fill="currentColor" /> {value} 星
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setMarkets([]);
                    setScope("all");
                    setImportance([]);
                  }}
                  className="mt-5 text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  重置筛选
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {eventsQuery.data?.data_source.state === "stale" ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-warning/20 bg-warning/5 px-3.5 py-2.5 text-sm text-warning">
            <Clock3 size={14} /> {eventsQuery.data.data_source.message ?? "当前展示最近一次成功同步的数据"}
          </div>
        ) : null}

        {eventsQuery.isError ? (
          <div className="mt-5 flex min-h-[180px] items-center justify-center rounded-2xl border border-danger/25 bg-danger/5 p-6 text-center">
            <div>
              <p className="text-sm font-semibold text-foreground">{errorMessage}</p>
              <p className="mt-1 text-sm text-muted-foreground">请检查 Longbridge 数据源连接后重试</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => void eventsQuery.refetch()}>
                重新加载
              </Button>
            </div>
          </div>
        ) : (
          <div className="calendar-workspace mt-4 grid min-h-0 min-w-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.42fr)_minmax(360px,0.78fr)]">
            <div className="calendar-pane flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card/45 p-3.5 shadow-subtle sm:p-4">
              <div className="mb-3 flex shrink-0 items-center justify-between gap-3 px-1">
                <div>
                  <p className="font-mono text-[0.70rem] tracking-[0.16em] text-muted-foreground">MONTH VIEW</p>
                </div>
                <div className="flex items-center gap-2 text-[0.78rem] text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-primary" /> {meta.label}
                </div>
              </div>
              <div className="calendar-grid flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80">
                <div className="calendar-days-scroll min-h-0 flex-1 overflow-y-auto" role="region" aria-label="月历日期，可上下滚动查看更多">
                  <div className="calendar-days-grid grid min-h-[120%] grid-cols-7">
                    {WEEKDAYS.map((day) => (
                      <div key={day} className="sticky top-0 z-10 border-b border-r border-border/70 bg-background py-2 text-center font-sans text-[12.5px] font-semibold text-white last:border-r-0">
                        {day}
                      </div>
                    ))}
                    {calendarDays.map((day) => {
                      const iso = toIsoDate(day);
                      const dayEvents = eventsByDate.get(iso) ?? [];
                      const isOutside = day.getMonth() !== month.getMonth();
                      const isToday = isSameDate(day, today);
                      const isSelected = iso === selectedDate;
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => selectDay(day)}
                          className={cn(
                            "group relative min-h-0 overflow-hidden border-b border-r border-border/70 bg-card/20 p-1.5 text-left align-top transition hover:bg-secondary/60 sm:p-2",
                            isOutside && "bg-background/20 text-muted-foreground/45",
                            isSelected && "bg-primary/[0.07] shadow-[inset_0_0_0_1px_rgba(239,97,42,0.55)]",
                          )}
                        >
                          <span className={cn("inline-flex min-w-6 items-center justify-center rounded-md px-1 font-mono text-[0.86rem]", isToday && "bg-primary font-semibold text-primary-foreground", isSelected && !isToday && "text-primary")}>{day.getDate()}</span>
                          <span className="mt-1.5 block space-y-1 overflow-hidden">
                            {dayEvents.slice(0, 2).map((event) => (
                              <span key={event.id} className={cn("block truncate rounded-md border px-1.5 py-0.5 text-[0.68rem]", CATEGORY_META[event.category].chip)} title={event.title}>
                                {event.category !== "macro" && event.security_name ? event.security_name : event.title}
                              </span>
                            ))}
                            {dayEvents.length > 2 ? <span className="block pl-1 text-[0.72rem] text-muted-foreground">+{dayEvents.length - 2} 更多</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="calendar-timeline-panel flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card/45 p-3.5 shadow-subtle sm:p-4">
              <div className="mb-3 flex shrink-0 items-start justify-between gap-3 px-1">
                <div>
                  <p className="font-mono text-[0.70rem] tracking-[0.16em] text-muted-foreground">UPCOMING EVENTS</p>
                  <h2 className="mt-0.5 text-lg font-semibold">{dateLabel(selectedDate)}</h2>
                </div>
                <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[12px] text-muted-foreground">
                  {timelineGroups.reduce((total, group) => total + group.items.length, 0)} 条
                </span>
              </div>
              <div className="calendar-timeline-scroll min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                {eventsQuery.isPending && !eventsQuery.data ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-secondary/70" />)}
                  </div>
                ) : timelineGroups.length === 0 ? (
                  <CalendarEmptyState date={selectedDate} />
                ) : (
                  timelineGroups.map((group) => (
                    <section key={group.event_date}>
                      <div className="mb-2 flex items-center gap-2 border-b border-border/70 px-1 pb-1.5">
                        <span className="text-[0.86rem] font-semibold text-foreground">{dateLabel(group.event_date)}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{group.event_date}</span>
                        <span className="ml-auto rounded bg-secondary/80 px-1.5 py-0.5 text-[11px] text-muted-foreground">{group.items.length} 条</span>
                      </div>
                      <div className="space-y-2">
                        {group.items.map((event) => <EventCard key={event.id} event={event} onClick={() => setSelectedEvent(event)} />)}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {selectedEvent ? <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} /> : null}
    </section>
  );
}
