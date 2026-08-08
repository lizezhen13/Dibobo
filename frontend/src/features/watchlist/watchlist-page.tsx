import { Star } from "lucide-react";

import { PlaceholderPage } from "../../pages/placeholder-page";

export function WatchlistPage() {
  return (
    <PlaceholderPage
      eyebrow="自选管理 / WATCHLIST"
      title="自选管理"
      description="维护关注的股票与基金列表，快速跟踪心仪标的。"
      icon={Star}
    />
  );
}
