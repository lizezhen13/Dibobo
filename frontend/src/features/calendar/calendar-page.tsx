import { CalendarDays } from "lucide-react";

import { PlaceholderPage } from "../../pages/placeholder-page";

export function CalendarPage() {
  return (
    <PlaceholderPage
      eyebrow="事件日历 / CALENDAR"
      title="事件日历"
      description="跟踪财报披露、分红除息、宏观发布等关键事件日程。"
      icon={CalendarDays}
    />
  );
}
