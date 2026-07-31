import { BookOpenText, Radar } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/app-shell";
import { AuthGuard, GuestGuard } from "./features/auth/auth-guard";
import { LoginPage } from "./features/auth/login-page";
import { HoldingsPage } from "./features/holdings/holdings-page";
import { OverviewPage } from "./features/overview/overview-page";
import { SettingsPage } from "./features/settings/settings-page";
import { PlaceholderPage } from "./pages/placeholder-page";

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
          <Route
            path="/radar"
            element={
              <PlaceholderPage
                eyebrow="DIVIDEND RADAR / 红利雷达"
                title="红利雷达"
                description="后续将在完整指标快照上实现三值筛选、服务端排序分页与当前页行情刷新。"
                icon={Radar}
              />
            }
          />
          <Route
            path="/journals"
            element={
              <PlaceholderPage
                eyebrow="INVESTMENT NOTES / 投资日记"
                title="投资日记"
                description="后续将实现按日期检索的纯文本日记、分页、编辑和永久删除确认。"
                icon={BookOpenText}
              />
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}
