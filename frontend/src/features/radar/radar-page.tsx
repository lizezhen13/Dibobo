import { Radar } from "lucide-react";

import { PlaceholderPage } from "../../pages/placeholder-page";

export function RadarPage() {
  return (
    <PlaceholderPage
      eyebrow="红利雷达 / DIVIDEND RADAR"
      title="红利雷达"
      description="按股息率、估值与盈利质量筛选值得持续跟踪的标的。"
      icon={Radar}
    />
  );
}
