import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/app-shell";
import { LoadingState } from "./components/patterns";
import { AuthGuard, GuestGuard } from "./features/auth/auth-guard";

const LoginPage = lazy(() => import("./features/auth/login-page").then(({ LoginPage: Page }) => ({ default: Page })));
const CalendarPage = lazy(() => import("./features/calendar/calendar-page").then(({ CalendarPage: Page }) => ({ default: Page })));
const JournalsPage = lazy(() => import("./features/journals/journals-page").then(({ JournalsPage: Page }) => ({ default: Page })));
const NewsPage = lazy(() => import("./features/news/news-page").then(({ NewsPage: Page }) => ({ default: Page })));
const OverviewPage = lazy(() => import("./features/overview/overview-page").then(({ OverviewPage: Page }) => ({ default: Page })));
const PortfoliosPage = lazy(() => import("./features/portfolios/portfolios-page").then(({ PortfoliosPage: Page }) => ({ default: Page })));
const WatchlistPage = lazy(() => import("./features/watchlist/watchlist-page").then(({ WatchlistPage: Page }) => ({ default: Page })));
const StockDetailPage = lazy(() =>
  import("./features/watchlist/stock-detail-page").then(({ StockDetailPage: Page }) => ({ default: Page })),
);
const PortfolioStockDetailPage = lazy(() =>
  import("./features/portfolios/portfolio-stock-detail-page").then(({ PortfolioStockDetailPage: Page }) => ({ default: Page })),
);
const RadarPage = lazy(() => import("./features/radar/radar-page").then(({ RadarPage: Page }) => ({ default: Page })));
const ReviewPage = lazy(() => import("./features/review/review-page").then(({ ReviewPage: Page }) => ({ default: Page })));
const SettingsPage = lazy(() => import("./features/settings/settings-page").then(({ SettingsPage: Page }) => ({ default: Page })));

function RouteLoading() {
  return <LoadingState label="页面加载中…" className="min-h-[50vh]" />;
}

export function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route element={<GuestGuard />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/watchlist/detail/:ticker" element={<StockDetailPage />} />
            <Route path="/portfolios" element={<PortfoliosPage />} />
            <Route path="/portfolios/detail/:portfolioId/:ticker" element={<PortfolioStockDetailPage />} />
            <Route path="/holdings" element={<Navigate to="/portfolios" replace />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/radar" element={<RadarPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/journals" element={<JournalsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Suspense>
  );
}
