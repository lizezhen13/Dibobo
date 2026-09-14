import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../ui/button";
import { EmptyState } from "./async-state";
import { ExternalContentFrame } from "./external-content-frame";
import { PageContainer } from "./page-container";

export function StockDetail({ ticker: rawTicker, returnTo, moduleName }: { ticker?: string; returnTo: string; moduleName: string }) {
  const ticker = rawTicker?.trim().replace(/[^0-9A-Za-z]/g, "") ?? "";
  if (!ticker)
    return (
      <PageContainer size="wide" className="p-6">
        <EmptyState
          icon={FileText}
          title="缺少有效的股票代码"
          description={`当前详情地址无法识别，请返回${moduleName}后重新选择标的。`}
          action={
            <Button asChild>
              <Link to={returnTo}>
                <ArrowLeft size={16} />
                返回{moduleName}
              </Link>
            </Button>
          }
        />
      </PageContainer>
    );
  const src = `https://stockpage.10jqka.com.cn/${encodeURIComponent(ticker)}`;
  return (
    <PageContainer size="fluid" layout="embedded" className="bg-background">
      <h1 className="sr-only">{ticker} 股票详情</h1>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <p className="text-caption text-subtle">
          {moduleName} · {ticker} · 内容来自同花顺
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href={src} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              新窗口打开
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={returnTo}>
              <ArrowLeft size={16} />
              返回
            </Link>
          </Button>
        </div>
      </div>
      <ExternalContentFrame key={ticker} src={src} title={`${ticker} 股票详情`} loading="eager" />
    </PageContainer>
  );
}
