import { OverviewPanel, PanelState } from "./overview-panel";

// 财经资讯占位卡片：内容暂未接入，仅保留面板布局
export function NewsCard() {
  return (
    <OverviewPanel title="财经资讯" label="FINANCIAL NEWS" className="min-h-[350px]">
      <PanelState kind="empty" message="财经资讯暂未接入，后续将在此展示最新财经要闻。" />
    </OverviewPanel>
  );
}
