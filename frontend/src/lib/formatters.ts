export const MISSING_VALUE = "暂无数据";

export function formatPoint(value: number | null): string {
  if (value === null) return MISSING_VALUE;
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatSignedPoint(value: number | null): string {
  if (value === null) return MISSING_VALUE;
  const formatted = formatPoint(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

export function formatPercent(value: number | null): string {
  if (value === null) return MISSING_VALUE;
  const formatted = Math.abs(value).toFixed(2);
  if (value > 0) return `+${formatted}%`;
  if (value < 0) return `-${formatted}%`;
  return `${formatted}%`;
}

export function formatMoney(value: number | null): string {
  if (value === null) return MISSING_VALUE;
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 100_000_000) return `${sign}${(absolute / 100_000_000).toFixed(2)} 亿元`;
  if (absolute >= 10_000) return `${sign}${(absolute / 10_000).toFixed(2)} 万元`;
  return `${sign}${absolute.toFixed(2)} 元`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return MISSING_VALUE;
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return MISSING_VALUE;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replaceAll("/", "-");
}

export function movementClass(value: number | null): string {
  if (value === null || value === 0) return "text-ink-muted";
  return value > 0 ? "text-market-up" : "text-market-down";
}
