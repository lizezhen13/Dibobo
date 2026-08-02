import { ArrowUpRight, DatabaseZap, Settings2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { DragonTigerCard } from "./dragon-tiger-card";
import { HotStocksCard } from "./hot-stocks-card";
import { IndicesPanel } from "./indices-panel";
import { IndustryDetailCard } from "./industry-detail-card";
import { MarketBreadthCard } from "./market-breadth-card";
import {
  useDragonTigerQuery,
  useHotStocksQuery,
  useIndustriesQuery,
  useMarketBreadthQuery,
  useOverviewQuery,
} from "./queries";

export function OverviewPage() {
  const indices = useOverviewQuery();
  const hotStocks = useHotStocksQuery();
  const dragonTiger = useDragonTigerQuery();
  const marketBreadth = useMarketBreadthQuery();
  const industries = useIndustriesQuery();
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const queries = [indices, hotStocks, dragonTiger, marketBreadth, industries];

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

  return (
    <div className="mx-auto w-full max-w-[1600px] animate-enter">
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(340px,0.95fr)] 2xl:grid-rows-[auto_350px_350px]">
        <div className="min-w-0 xl:col-span-2 2xl:col-span-3">
          <IndicesPanel
            query={indices}
            onRefresh={() => void refreshAll()}
            isRefreshing={manualRefreshing}
          />
        </div>
        <div className="min-w-0 2xl:col-start-1 2xl:row-start-2">
          <HotStocksCard query={hotStocks} />
        </div>
        <div className="min-w-0 2xl:col-start-2 2xl:row-start-2">
          <DragonTigerCard query={dragonTiger} />
        </div>
        <div className="min-w-0 xl:col-span-2 2xl:col-span-2 2xl:col-start-1 2xl:row-start-3">
          <MarketBreadthCard query={marketBreadth} />
        </div>
        <div className="min-w-0 xl:col-span-2 2xl:col-span-1 2xl:col-start-3 2xl:row-span-2 2xl:row-start-2">
          <IndustryDetailCard query={industries} />
        </div>
      </div>
    </div>
  );
}
