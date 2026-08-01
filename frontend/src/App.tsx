import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/app-shell";
import { AuthGuard, GuestGuard } from "./features/auth/auth-guard";
import { LoginPage } from "./features/auth/login-page";
import { HoldingsPage } from "./features/holdings/holdings-page";
import { JournalsPage } from "./features/journals/journals-page";
import { OverviewPage } from "./features/overview/overview-page";
import { RadarPage } from "./features/radar/radar-page";
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
          <Route path="/holdings" element={<HoldingsPage />} />
          <Route path="/radar" element={<RadarPage />} />
          <Route path="/journals" element={<JournalsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}
