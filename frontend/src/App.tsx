import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/app-shell";
import { AuthGuard, GuestGuard } from "./features/auth/auth-guard";
import { LoginPage } from "./features/auth/login-page";
import { CalendarPage } from "./features/calendar/calendar-page";
import { JournalsPage } from "./features/journals/journals-page";
import { NewsPage } from "./features/news/news-page";
import { OverviewPage } from "./features/overview/overview-page";
import { PortfoliosPage } from "./features/portfolios/portfolios-page";
import { WatchlistPage } from "./features/watchlist/watchlist-page";
import { RadarPage } from "./features/radar/radar-page";
import { ReviewPage } from "./features/review/review-page";
import { SettingsPage } from "./features/settings/settings-page";

export function App() {
  return (
    <Routes>
      <Route element={<GuestGuard />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/portfolios" element={<PortfoliosPage />} />
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
  );
}
