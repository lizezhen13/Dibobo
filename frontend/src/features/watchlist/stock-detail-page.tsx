import { ArrowLeft, FileText } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { Button } from "../../components/ui/button";

const STOCKPAGE_ORIGIN = "https://stockpage.10jqka.com.cn";

export function StockDetailPage() {
  const { ticker: routeTicker } = useParams<{ ticker: string }>();
  const ticker = normalizeTicker(routeTicker);
  const stockPageUrl = ticker
    ? `${STOCKPAGE_ORIGIN}/${encodeURIComponent(ticker)}`
    : null;

  if (!stockPageUrl) {
    return <InvalidTickerState />;
  }

  return (
    <div className="-mx-8 -my-8 flex h-[calc(100vh-68px)] min-h-0 flex-col overflow-hidden bg-background xl:-mx-10 xl:-my-10">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-5">
        <Link
          to="/watchlist"
          className="inline-flex items-center gap-2 rounded-lg border border-border/90 bg-background px-3.5 py-1.5 text-[0.86rem] font-semibold text-foreground shadow-subtle transition hover:border-primary/40 hover:bg-secondary hover:text-primary"
        >
          <ArrowLeft size={16} />
          返回自选管理
        </Link>
        <div className="hidden items-center gap-2 text-[0.7rem] text-muted-foreground/65 sm:flex">
          <span className="size-1.5 rounded-full bg-market-up" />
          <span className="font-mono tracking-[0.14em]">INLINE DETAIL · {ticker}</span>
        </div>
      </div>
      <iframe
        src={stockPageUrl}
        title={`${ticker} 股票详情`}
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        className="block min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}

function InvalidTickerState() {
  return (
    <div className="mx-auto max-w-[1700px] animate-enter">
      <div className="rounded-xl border border-border bg-card px-6 py-16 text-center shadow-raised">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-primary/20 bg-primary/8 text-primary">
          <FileText size={23} />
        </span>
        <p className="mt-5 font-mono text-[0.64rem] tracking-[0.16em] text-primary/75">WATCHLIST / INVALID CODE</p>
        <h1 className="mt-2 font-display text-2xl tracking-tight text-foreground">缺少有效的股票代码</h1>
        <p className="mx-auto mt-2 max-w-md text-[0.9rem] leading-relaxed text-muted-foreground">
          当前详情地址无法识别，请返回自选管理后重新选择标的。
        </p>
        <Button asChild className="mt-6">
          <Link to="/watchlist">
            <ArrowLeft size={15} />
            返回自选管理
          </Link>
        </Button>
      </div>
    </div>
  );
}

function normalizeTicker(value: string | undefined): string {
  return value?.trim().replace(/[^0-9A-Za-z]/g, "") ?? "";
}
