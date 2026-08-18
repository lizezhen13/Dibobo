import { ArrowLeft, ExternalLink, FileText, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/patterns";

const STOCKPAGE_ORIGIN = "https://stockpage.10jqka.com.cn";

type StockDetailContext = "watchlist" | "radar";

export function StockDetailPage({ context = "watchlist" }: { context?: StockDetailContext }) {
  const { ticker: routeTicker } = useParams<{ ticker: string }>();
  const ticker = normalizeTicker(routeTicker);
  const [frameError, setFrameError] = useState(false);
  const stockPageUrl = ticker ? `${STOCKPAGE_ORIGIN}/${encodeURIComponent(ticker)}` : null;
  const returnTo = context === "radar" ? "/radar" : "/watchlist";
  const detailLabel = context === "radar" ? "RADAR DETAIL" : "INLINE DETAIL";

  if (!stockPageUrl) {
    return <InvalidTickerState context={context} />;
  }

  return (
    <PageContainer size="fluid" className="flex h-[calc(100vh-68px)] min-h-0 flex-col overflow-hidden bg-background">
      <h1 className="sr-only">{ticker} 股票详情</h1>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-5">
        <div className="hidden items-center gap-2 text-[0.7rem] text-muted-foreground/65 sm:flex">
          <span className="size-1.5 rounded-full bg-market-up" />
          <span className="font-mono tracking-[0.14em]">
            {detailLabel} · {ticker}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href={stockPageUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> 新窗口打开
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link to={returnTo}>返回</Link>
          </Button>
        </div>
      </div>
      {frameError ? (
        <div
          className="flex items-center justify-between gap-4 border-b border-warning/20 bg-warning/[0.08] px-5 py-3 text-sm"
          role="alert"
        >
          <span className="flex items-center gap-2 text-warning">
            <TriangleAlert size={15} /> 第三方详情无法嵌入当前页面，请改用新窗口打开。
          </span>
          <a className="shrink-0 text-primary underline-offset-4 hover:underline" href={stockPageUrl} target="_blank" rel="noreferrer">
            打开详情
          </a>
        </div>
      ) : null}
      <iframe
        src={stockPageUrl}
        title={`${ticker} 股票详情`}
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        onError={() => setFrameError(true)}
        className="block min-h-0 w-full flex-1 border-0 bg-white"
      />
    </PageContainer>
  );
}

export function RadarStockDetailPage() {
  return <StockDetailPage context="radar" />;
}

function InvalidTickerState({ context }: { context: StockDetailContext }) {
  const isRadar = context === "radar";
  const moduleName = isRadar ? "红利雷达" : "自选管理";
  const returnTo = isRadar ? "/radar" : "/watchlist";

  return (
    <PageContainer size="wide">
      <div className="rounded-xl border border-border bg-card px-6 py-16 text-center shadow-raised">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-primary/20 bg-primary/8 text-primary">
          <FileText size={23} />
        </span>
        <p className="mt-5 font-mono text-[0.64rem] tracking-[0.16em] text-primary/75">{isRadar ? "RADAR" : "WATCHLIST"} / INVALID CODE</p>
        <h1 className="mt-2 font-display text-2xl tracking-tight text-foreground">缺少有效的股票代码</h1>
        <p className="mx-auto mt-2 max-w-md text-[0.9rem] leading-relaxed text-muted-foreground">
          当前详情地址无法识别，请返回{moduleName}后重新选择标的。
        </p>
        <Button asChild className="mt-6">
          <Link to={returnTo}>
            <ArrowLeft size={15} />
            返回{moduleName}
          </Link>
        </Button>
      </div>
    </PageContainer>
  );
}

function normalizeTicker(value: string | undefined): string {
  return value?.trim().replace(/[^0-9A-Za-z]/g, "") ?? "";
}
