import { ExternalLink, Globe2, Landmark, LoaderCircle, RadioTower, RefreshCw } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "../../components/patterns";
import { ExternalContentFrame } from "../../components/patterns/external-content-frame";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { cn } from "../../lib/utils";
import "./news.css";

type NewsSourceId = "cls" | "eastmoney" | "jin10";

interface NewsSource {
  id: NewsSourceId;
  label: string;
  english: string;
  description: string;
  domain: string;
  url: string;
  accent: string;
  icon: typeof RadioTower;
}

const NEWS_SOURCES: readonly NewsSource[] = [
  {
    id: "cls",
    label: "财联社",
    english: "CLS",
    description: "深度解读与实时电报",
    domain: "cls.cn",
    url: "https://www.cls.cn/depth?id=1000",
    accent: "#f5a524",
    icon: RadioTower,
  },
  {
    id: "eastmoney",
    label: "东方财富",
    english: "EASTMONEY",
    description: "市场要闻与投资资讯",
    domain: "finance.eastmoney.com",
    url: "https://finance.eastmoney.com/",
    accent: "#ef612a",
    icon: Landmark,
  },
  {
    id: "jin10",
    label: "金十数据",
    english: "JIN10",
    description: "全球宏观与快讯追踪",
    domain: "xnews.jin10.com",
    url: "https://xnews.jin10.com/",
    accent: "#57b7a3",
    icon: Globe2,
  },
];

const INITIAL_LOAD_STATE: Record<NewsSourceId, boolean> = {
  cls: false,
  eastmoney: false,
  jin10: false,
};

const INITIAL_RELOAD_STATE: Record<NewsSourceId, number> = {
  cls: 0,
  eastmoney: 0,
  jin10: 0,
};

function isNewsSourceId(value: string): value is NewsSourceId {
  return NEWS_SOURCES.some((source) => source.id === value);
}

export function NewsPage() {
  const [activeSourceId, setActiveSourceId] = useState<NewsSourceId>("cls");
  const [mountedSourceIds, setMountedSourceIds] = useState<NewsSourceId[]>(["cls"]);
  const [loadedSources, setLoadedSources] = useState<Record<NewsSourceId, boolean>>(INITIAL_LOAD_STATE);
  const [reloadTokens, setReloadTokens] = useState<Record<NewsSourceId, number>>(INITIAL_RELOAD_STATE);
  const activeSource = NEWS_SOURCES.find((source) => source.id === activeSourceId) ?? NEWS_SOURCES[0]!;

  const handleSourceChange = (value: string) => {
    if (!isNewsSourceId(value)) return;

    setActiveSourceId(value);
    setMountedSourceIds((current) => (current.includes(value) ? current : [...current, value]));
  };

  const markLoaded = (sourceId: NewsSourceId) => {
    setLoadedSources((current) => ({ ...current, [sourceId]: true }));
  };

  const refreshActiveSource = () => {
    setLoadedSources((current) => ({ ...current, [activeSourceId]: false }));
    setReloadTokens((current) => ({ ...current, [activeSourceId]: current[activeSourceId] + 1 }));
  };

  return (
    <PageContainer size="fluid" className="news-page flex min-h-0 flex-col overflow-hidden bg-background">
      <section className="news-hero shrink-0 border-b border-border/80 px-5 py-5 sm:px-7 sm:py-6 xl:px-9">
        <div className="news-hero-inner mx-auto flex max-w-[1680px] items-end justify-between gap-6">
          <div>
            <p className="eyebrow">财经资讯 / MARKET INTELLIGENCE</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-heading tracking-[-0.045em] text-foreground">财经资讯</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/5 px-2.5 py-1 font-mono text-caption tracking-[0.08em] text-success">
                <span className="size-1.5 rounded-full bg-success shadow-[0_0_8px_rgba(100,181,134,0.8)]" /> 原站直连
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-table leading-relaxed text-muted-foreground">
              在同一个工作台里切换三家主流财经资讯来源，内容由原站实时提供。
            </p>
          </div>

          <div className="hidden shrink-0 items-end gap-4 sm:flex">
            <div className="text-right">
              <p className="font-mono text-caption tracking-[0.2em] text-subtle">ACTIVE SOURCE</p>
              <p className="mt-1 text-body-sm font-semibold text-foreground">{activeSource.label}</p>
            </div>
            <div className="news-hero-index font-mono text-display leading-none text-muted-foreground">03</div>
          </div>
        </div>
      </section>

      <div className="news-toolbar shrink-0 border-b border-border/80 px-5 py-3 sm:px-7 xl:px-9">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3">
          <Tabs value={activeSourceId} onValueChange={handleSourceChange} className="min-w-0">
            <TabsList
              variant="segment"
              aria-label="财经资讯来源"
              className="h-auto max-w-full flex-wrap justify-start gap-1.5 bg-transparent p-0"
            >
              {NEWS_SOURCES.map((source) => {
                const Icon = source.icon;
                return (
                  <TabsTrigger
                    key={source.id}
                    value={source.id}
                    variant="segment"
                    className={cn(
                      "news-source-tab h-10 gap-2 rounded-lg border px-3.5 text-caption font-semibold sm:px-4",
                      "border-border bg-card text-muted-foreground hover:border-primary/35 hover:text-foreground",
                      "data-[state=active]:border-primary/55 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-subtle",
                    )}
                  >
                    <span className="grid size-5 place-items-center rounded-md bg-background/60" style={{ color: source.accent }}>
                      <Icon size={13} strokeWidth={2} />
                    </span>
                    <span>{source.label}</span>
                    <span className="hidden font-mono text-caption tracking-[0.12em] opacity-55 sm:inline">{source.english}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 pr-2 text-caption text-muted-foreground sm:flex">
              <span className={cn("size-1.5 rounded-full", loadedSources[activeSourceId] ? "bg-success" : "bg-warning")} />
              {loadedSources[activeSourceId] ? "页面已加载" : "等待页面加载"}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={refreshActiveSource}>
              {loadedSources[activeSourceId] ? <RefreshCw size={14} /> : <LoaderCircle size={14} className="animate-spin" />}
              刷新
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={activeSource.url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                <span className="hidden sm:inline">原站打开</span>
                <span className="sm:hidden">打开</span>
              </a>
            </Button>
          </div>
        </div>
      </div>

      <section
        className="news-frame-stage min-h-0 flex-1 px-3 py-3 sm:px-5 sm:py-4 lg:px-7 xl:px-9"
        aria-label={`${activeSource.label}资讯内容`}
      >
        <Card className="news-frame-shell mx-auto flex h-full max-w-[1680px] min-h-0 flex-col overflow-hidden">
          <div className="news-frame-meta flex shrink-0 items-center justify-between gap-4 border-b border-border/80 bg-card-deep px-3.5 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: activeSource.accent }} />
              <span className="truncate text-caption font-semibold text-foreground">{activeSource.label}</span>
              <span className="hidden truncate font-mono text-caption tracking-[0.06em] text-subtle sm:inline">{activeSource.domain}</span>
            </div>
            <div className="hidden items-center gap-2 text-caption text-subtle md:flex">
              <span>{activeSource.description}</span>
              <span aria-hidden="true" className="text-border">
                /
              </span>
              <span>内容来自原站</span>
            </div>
          </div>

          <div className="news-frame-viewport relative min-h-0 flex-1 bg-white">
            {NEWS_SOURCES.map((source) => {
              if (!mountedSourceIds.includes(source.id)) return null;

              const isActive = source.id === activeSourceId;
              return (
                <div
                  key={source.id}
                  className={cn(
                    "absolute inset-0 bg-white transition-opacity duration-200",
                    isActive ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0",
                  )}
                  role="tabpanel"
                  aria-label={`${source.label}内联页面`}
                  aria-hidden={!isActive}
                >
                  <ExternalContentFrame
                    key={`${source.id}-${reloadTokens[source.id]}`}
                    title={`${source.label}财经资讯`}
                    src={source.url}
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="size-full"
                    tabIndex={isActive ? 0 : -1}
                    onLoad={() => markLoaded(source.id)}
                  />
                  {isActive && !loadedSources[source.id] ? (
                    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-background/75 backdrop-blur-[2px]">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <LoaderCircle size={22} className="animate-spin text-primary-text" />
                        <div>
                          <p className="text-body-sm font-medium text-foreground">正在打开 {source.label}</p>
                          <p className="mt-1 text-caption text-muted-foreground">首次加载由原站提供，可能需要一点时间</p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      <p className="shrink-0 px-5 pb-3 text-center text-caption text-subtle sm:px-7">
        资讯页面为第三方原站内联展示；如页面未正常显示，请使用“原站打开”。
      </p>
    </PageContainer>
  );
}
