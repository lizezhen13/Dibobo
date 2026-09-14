import { useParams } from "react-router-dom";
import { StockDetail } from "../../components/patterns/stock-detail";

export function StockDetailPage({ context = "watchlist" }: { context?: "watchlist" | "radar" }) {
  const { ticker } = useParams<{ ticker: string }>();
  return (
    <StockDetail
      ticker={ticker}
      returnTo={context === "radar" ? "/radar" : "/watchlist"}
      moduleName={context === "radar" ? "红利雷达" : "自选管理"}
    />
  );
}

export function RadarStockDetailPage() {
  return <StockDetailPage context="radar" />;
}
