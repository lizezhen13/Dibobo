import { useParams } from "react-router-dom";
import { StockDetail } from "../../components/patterns/stock-detail";

export function PortfolioStockDetailPage() {
  const { portfolioId: routePortfolioId, ticker } = useParams<{ portfolioId: string; ticker: string }>();
  const portfolioId = routePortfolioId?.trim() ?? "";
  return (
    <StockDetail
      ticker={ticker}
      returnTo={portfolioId ? `/portfolios?portfolio=${encodeURIComponent(portfolioId)}` : "/portfolios"}
      moduleName="投资组合"
    />
  );
}
