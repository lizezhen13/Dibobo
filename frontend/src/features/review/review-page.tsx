import { LineChart } from "lucide-react";

import { PlaceholderPage } from "../../pages/placeholder-page";

export function ReviewPage() {
  return (
    <PlaceholderPage
      eyebrow="复盘分析 / REVIEW"
      title="复盘分析"
      description="回顾交易与市场表现，沉淀可复用的投资经验。"
      icon={LineChart}
    />
  );
}
