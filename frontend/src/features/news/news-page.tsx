import { Newspaper } from "lucide-react";

import { PlaceholderPage } from "../../pages/placeholder-page";

export function NewsPage() {
  return (
    <PlaceholderPage
      eyebrow="财经资讯 / NEWS"
      title="财经资讯"
      description="聚合市场要闻、公告与宏观动态，辅助投资决策。"
      icon={Newspaper}
    />
  );
}
