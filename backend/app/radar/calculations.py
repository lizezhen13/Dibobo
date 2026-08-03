from datetime import date
from zoneinfo import ZoneInfo

from app.data_sources.domain import DividendEvent, Instrument


def report_candidates(today: date) -> list[str]:
    if today.month >= 10:
        first_quarter = 3
    elif today.month >= 8:
        first_quarter = 2
    elif today.month >= 4:
        first_quarter = 1
    else:
        first_quarter = 4

    year = today.year if first_quarter != 4 else today.year - 1
    candidates: list[str] = []
    quarter = first_quarter
    while len(candidates) < 8:
        candidates.append(f"{year}-{quarter}")
        if quarter == 1:
            year -= 1
            quarter = 4
        else:
            quarter -= 1
    return candidates


def display_report_period(report: str | None) -> str | None:
    if report is None or "-" not in report:
        return report
    year, quarter = report.split("-", 1)
    suffix = {"1": "Q1", "2": "H1", "3": "Q3", "4": "FY"}.get(quarter)
    return f"{year}-{suffix}" if suffix else report


def one_year_before(value: date) -> date:
    try:
        return value.replace(year=value.year - 1)
    except ValueError:
        return value.replace(year=value.year - 1, day=28)


def years_before(value: date, years: int) -> date:
    try:
        return value.replace(year=value.year - years)
    except ValueError:
        return value.replace(year=value.year - years, day=28)


def calculate_dividend_metrics(
    events: list[DividendEvent],
    latest: float,
    as_of: date,
) -> tuple[float, int]:
    window_start = one_year_before(as_of)
    local_dates = [
        (event, event.ex_date.astimezone(ZoneInfo("Asia/Shanghai")).date())
        for event in events
    ]
    ttm_cash = sum(
        event.dividend_per_share
        for event, ex_date in local_dates
        if window_start <= ex_date <= as_of and event.dividend_per_share > 0
    )
    event_years = {
        ex_date.year
        for event, ex_date in local_dates
        if ex_date <= as_of and event.dividend_per_share > 0
    }
    if as_of.year in event_years:
        cursor = as_of.year
    elif as_of.year - 1 in event_years:
        cursor = as_of.year - 1
    else:
        cursor = -1

    consecutive = 0
    while cursor in event_years:
        consecutive += 1
        cursor -= 1
    return ttm_cash / latest * 100, consecutive


def excluded_status(instrument: Instrument, has_valid_quote: bool) -> str | None:
    normalized_name = instrument.name.upper().replace(" ", "")
    if normalized_name.startswith("*ST") or normalized_name.startswith("ST"):
        return "ST"
    if "退" in instrument.name:
        return "退市整理"
    if not has_valid_quote:
        return "停牌或行情缺失"
    return None
