import { CalendarDays, ChevronLeft, ChevronRight, Clock3, LoaderCircle, RefreshCw, SlidersHorizontal, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "../../components/ui/button";
import { EmptyState, PageContainer } from "../../components/patterns";
import "./calendar.css";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { ApiError } from "../../lib/api";
import { cn } from "../../lib/utils";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { CATEGORY_META, dateLabel } from "./calendar-meta";
import { EventCard, EventDrawer } from "./calendar-event-sheet";
import { useCalendarEventsQuery, useCalendarFiltersQuery, useRefreshCalendarMutation } from "./queries";
import type { CalendarCategory, CalendarEvent, CalendarQueryParams, CalendarScope } from "./types";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const DEFAULT_MARKETS = ["US", "HK", "SH", "SZ"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

function useCurrentDay() {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    let timer: number;
    const scheduleNextDay = () => {
      const now = new Date();
      const nextDay = new Date(now);
      nextDay.setHours(24, 0, 0, 0);
      timer = window.setTimeout(
        () => {
          setToday(new Date());
          scheduleNextDay();
        },
        Math.max(1_000, nextDay.getTime() - now.getTime() + 50),
      );
    };
    scheduleNextDay();
    return () => window.clearTimeout(timer);
  }, []);

  return today;
}

export function CalendarPage() {
  const today = useCurrentDay();
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

  const changeCategory = (nextCategory: CalendarCategory) => {
    setCategory(nextCategory);
    setMarkets([]);
    setImportance([]);
    setScope("all");
    setSelectedEvent(null);
  };

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
    <PageContainer edgeToEdge className="calendar-page flex min-h-0 flex-col overflow-hidden bg-background">
      <h1 className="sr-only">事件日历</h1>
      <div className="calendar-toolbar shrink-0 border-b border-border bg-background px-5 py-3 xl:px-7">
        <Tabs value={category} onValueChange={(value) => changeCategory(value as CalendarCategory)}>
          <TabsList variant="segment" aria-label="事件类型" className="h-auto flex-wrap justify-start gap-1.5 bg-transparent p-0">
            {(Object.keys(CATEGORY_META) as CalendarCategory[]).map((item) => {
              const itemMeta = CATEGORY_META[item];
              const Icon = itemMeta.icon;
              return (
                <TabsTrigger
                  key={item}
                  value={item}
                  variant="segment"
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition",
                    "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                    "data-[state=active]:border-primary/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-subtle",
                  )}
                >
                  <Icon size={14} /> {itemMeta.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
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
          <div className="flex items-center gap-2">
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  aria-expanded={filtersOpen}
                  className={cn("text-[12px]", filterCount > 0 && "border-primary/50 text-primary")}
                >
                  <SlidersHorizontal size={14} /> 筛选
                  {filterCount > 0 ? (
                    <span className="grid size-4 place-items-center rounded-full bg-primary text-[0.7rem] text-primary-foreground">
                      {filterCount}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={10}
                className="w-[min(360px,calc(100vw-32px))] rounded-2xl border-border bg-card p-4 shadow-dialog"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">筛选事件</p>
                    <p className="mt-0.5 text-[0.78rem] text-muted-foreground">条件会合并应用到当前分类</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label="关闭筛选"
                  >
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
                        aria-pressed={markets.length === 0 || markets.includes(market)}
                        onClick={() => toggleMarket(market)}
                        className={cn(
                          "rounded-lg border px-2.5 py-1.5 font-mono text-[0.78rem] transition",
                          markets.length === 0 || markets.includes(market)
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
                      {(
                        [
                          ["all", "全部关注"],
                          ["watchlist", "自选"],
                          ["holding", "持仓"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={scope === value}
                          onClick={() => setScope(value)}
                          className={cn(
                            "rounded-lg border px-2.5 py-1.5 text-[0.78rem] transition",
                            scope === value
                              ? "border-primary/50 bg-primary/15 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground",
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
                          aria-pressed={importance.includes(value)}
                          onClick={() => toggleImportance(value)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[0.78rem] transition",
                            importance.includes(value)
                              ? "border-warning/50 bg-warning/10 text-warning"
                              : "border-border text-muted-foreground hover:text-foreground",
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
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshMutation.isPending} className="text-[12px]">
              {refreshMutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              刷新
            </Button>
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
                <div
                  className="calendar-days-scroll min-h-0 flex-1 overflow-y-auto"
                  role="region"
                  aria-label="月历日期，可上下滚动查看更多"
                >
                  <div className="calendar-days-grid grid min-h-full grid-cols-7">
                    {WEEKDAYS.map((day) => (
                      <div
                        key={day}
                        className="sticky top-0 z-10 border-b border-r border-border/70 bg-background py-2 text-center font-sans text-[12.5px] font-semibold text-white last:border-r-0"
                      >
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
                          aria-label={`${dateLabel(iso)}，${dayEvents.length} 个事件`}
                          aria-current={isToday ? "date" : undefined}
                          aria-pressed={isSelected}
                          className={cn(
                            "group relative min-h-0 overflow-hidden border-b border-r border-border/70 bg-card/20 p-1.5 text-left align-top transition hover:bg-secondary/60 sm:p-2",
                            isOutside && "bg-background/20 text-muted-foreground/45",
                            isSelected && "bg-primary/[0.07] shadow-[inset_0_0_0_1px_rgba(239,97,42,0.55)]",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex min-w-6 items-center justify-center rounded-md px-1 font-mono text-[0.86rem]",
                              isToday && "bg-primary font-semibold text-primary-foreground",
                              isSelected && !isToday && "text-primary",
                            )}
                          >
                            {day.getDate()}
                          </span>
                          <span className="mt-1.5 block space-y-1 overflow-hidden">
                            {dayEvents.slice(0, 2).map((event) => (
                              <span
                                key={event.id}
                                className={cn(
                                  "block truncate rounded-md border px-1.5 py-0.5 text-[0.68rem]",
                                  CATEGORY_META[event.category].chip,
                                )}
                                title={event.title}
                              >
                                {event.category !== "macro" && event.security_name ? event.security_name : event.title}
                              </span>
                            ))}
                            {dayEvents.length > 2 ? (
                              <span className="block pl-1 text-[0.72rem] text-muted-foreground">+{dayEvents.length - 2} 更多</span>
                            ) : null}
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
                    {[1, 2, 3].map((item) => (
                      <div key={item} className="h-24 animate-pulse rounded-2xl bg-secondary/70" />
                    ))}
                  </div>
                ) : timelineGroups.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title={`${dateLabel(selectedDate)}之后暂无事件`}
                    description="切换分类、月份或筛选范围试试"
                    className="h-full min-h-[220px]"
                  />
                ) : (
                  timelineGroups.map((group) => (
                    <section key={group.event_date}>
                      <div className="mb-2 flex items-center gap-2 border-b border-border/70 px-1 pb-1.5">
                        <span className="text-[0.86rem] font-semibold text-foreground">{dateLabel(group.event_date)}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{group.event_date}</span>
                        <span className="ml-auto rounded bg-secondary/80 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {group.items.length} 条
                        </span>
                      </div>
                      <div className="space-y-2">
                        {group.items.map((event) => (
                          <EventCard key={event.id} event={event} onClick={() => setSelectedEvent(event)} />
                        ))}
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
    </PageContainer>
  );
}
