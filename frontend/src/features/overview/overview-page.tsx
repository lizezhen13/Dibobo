import { ArrowUpRight, DatabaseZap, Settings2 } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/patterns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { HotStocksCard } from "./hot-stocks-card";
import { IndicesPanel } from "./indices-panel";
import { IndustryDetailCard } from "./industry-detail-card";
import { MarketBreadthCard } from "./market-breadth-card";
import { NewsCard } from "./news-card";
import { useHotStocksQuery, useIndustriesQuery, useMarketBreadthQuery, useOverviewQuery } from "./queries";
import { refreshGlobalMarketGroup as requestGlobalMarketGroup, useGlobalMarketQuery } from "./global-market-queries";
import type { GlobalMarketGroupKey } from "./global-market-types";

const GlobalMarketPanel = lazy(() => import("./global-market-panel").then(({ GlobalMarketPanel: Panel }) => ({ default: Panel })));

function GlobalMarketLoading() {
  return (
    <div
      className="grid min-h-[360px] place-items-center rounded-xl border border-border/70 bg-card/40 text-sm text-muted-foreground"
      role="status"
    >
      全球市场模块加载中…
    </div>
  );
}

export function OverviewPage() {
  const [activeTab, setActiveTab] = useState("a-share");
  const isAShareActive = activeTab === "a-share";
  const indices = useOverviewQuery(isAShareActive);
  const hotStocks = useHotStocksQuery(isAShareActive);
  const marketBreadth = useMarketBreadthQuery(isAShareActive);
  const industries = useIndustriesQuery(isAShareActive);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [globalRefreshingGroups, setGlobalRefreshingGroups] = useState<Partial<Record<GlobalMarketGroupKey, boolean>>>({});
  const globalRefreshingRef = useRef(new Set<GlobalMarketGroupKey>());
  const globalMarket = useGlobalMarketQuery(activeTab === "global");
  const queries = [indices, hotStocks, marketBreadth, industries];

  const refreshAll = async () => {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    try {
      for (const query of queries) {
        if (!query.isFetching) {
          await query.refetch({ cancelRefetch: false });
        }
      }
    } finally {
      setManualRefreshing(false);
    }
  };

  const refreshGlobalMarketGroup = async (group: GlobalMarketGroupKey) => {
    if (globalRefreshingRef.current.has(group)) return;
    globalRefreshingRef.current.add(group);
    setGlobalRefreshingGroups((current) => ({ ...current, [group]: true }));
    try {
      await requestGlobalMarketGroup(group);
      await globalMarket.refetch({ cancelRefetch: false });
    } finally {
      globalRefreshingRef.current.delete(group);
      setGlobalRefreshingGroups((current) => ({ ...current, [group]: false }));
    }
  };

  return (
    <PageContainer size="wide">
      <h1 className="sr-only">市场概览</h1>
      {indices.data?.data_source.state === "not_configured" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-l-2 border-primary bg-primary/[0.07] px-4 py-3">
          <div className="flex items-center gap-3">
            <DatabaseZap className="shrink-0 text-primary" size={18} />
            <div>
              <p className="text-sm font-medium text-foreground">行情数据源尚未配置</p>
              <p className="mt-0.5 text-xs text-muted-foreground">完成数据源配置后即可读取实时行情。</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">
              <Settings2 size={13} /> 系统设置 <ArrowUpRight size={12} />
            </Link>
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="a-share">A股市场</TabsTrigger>
          <TabsTrigger value="global">全球市场</TabsTrigger>
        </TabsList>

        <TabsContent value="a-share" className="mt-0">
          {/* 2xl 下压缩人气榜列宽、加宽涨跌分布列 */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)_minmax(340px,0.95fr)] 2xl:grid-rows-[auto_350px_350px]">
            <div className="min-w-0 xl:col-span-2 2xl:col-span-3">
              <IndicesPanel query={indices} onRefresh={() => void refreshAll()} isRefreshing={manualRefreshing} />
            </div>
            <div className="min-w-0 2xl:col-start-1 2xl:row-start-2">
              <HotStocksCard query={hotStocks} />
            </div>
            <div className="min-w-0 2xl:col-start-2 2xl:row-start-2">
              <MarketBreadthCard query={marketBreadth} />
            </div>
            <div className="min-w-0 xl:col-span-2 2xl:col-span-2 2xl:col-start-1 2xl:row-start-3">
              <NewsCard />
            </div>
            <div className="min-w-0 xl:col-span-2 2xl:col-span-1 2xl:col-start-3 2xl:row-span-2 2xl:row-start-2">
              <IndustryDetailCard query={industries} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="global" className="mt-0">
          <Suspense fallback={<GlobalMarketLoading />}>
            <GlobalMarketPanel
              query={globalMarket}
              onRefreshGroup={(group) => void refreshGlobalMarketGroup(group)}
              refreshingGroups={globalRefreshingGroups}
            />
          </Suspense>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
