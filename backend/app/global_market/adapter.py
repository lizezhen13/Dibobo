import asyncio
import importlib
import logging
import math
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.global_market.catalog import (
    PRODUCTS_BY_GROUP,
    GlobalMarketGroup,
    ProductDefinition,
)

logger = logging.getLogger(__name__)

AKSHARE_VERSION = "1.18.84"
# Sina's foreign-commodity endpoint returns its date/clock in Beijing time,
# even though the products themselves use London time for market scheduling.
SINA_FOREIGN_QUOTE_TIMEZONE = "Asia/Shanghai"


class GlobalMarketAdapterError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(slots=True)
class GlobalMarketRawQuote:
    product_id: str
    source_symbol: str | None
    latest: float | None = None
    previous: float | None = None
    change: float | None = None
    change_percent: float | None = None
    quoted_at: datetime | None = None
    as_of_date: date | None = None
    fetched_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    mapped_contract: str | None = None
    source_status: str = "ok"
    missing_reason: str | None = None


@dataclass(slots=True)
class GlobalMarketFetchResult:
    group: GlobalMarketGroup
    quotes: dict[str, GlobalMarketRawQuote] = field(default_factory=dict)
    missing_reasons: dict[str, str] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    fetched_at: datetime = field(default_factory=lambda: datetime.now(UTC))


def _rows(frame: Any) -> list[dict[str, Any]]:
    if frame is None:
        return []
    if hasattr(frame, "to_dict"):
        try:
            result = frame.to_dict(orient="records")
        except TypeError:
            result = frame.to_dict()
        return [dict(item) for item in result if isinstance(item, dict)]
    if isinstance(frame, list):
        return [dict(item) for item in frame if isinstance(item, dict)]
    if isinstance(frame, tuple):
        return [dict(item) for item in frame if isinstance(item, dict)]
    return []


def _pick(row: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in row:
            return row[name]
    return None


def _text(value: Any) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        if math.isnan(float(value)):
            return None
    except (TypeError, ValueError):
        pass
    normalized = str(value).strip()
    return normalized or None


def _symbol(value: Any) -> str | None:
    value = _text(value)
    if value is None:
        return None
    return value.removeprefix("nf_").upper()


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = value.strip().replace(",", "")
        if not value:
            return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _normalize_datetime(value: Any, default_timezone: str = "Asia/Shanghai") -> datetime | None:
    if value is None:
        return None
    if hasattr(value, "to_pydatetime"):
        value = value.to_pydatetime()
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            for pattern in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
                try:
                    parsed = datetime.strptime(raw, pattern)
                    break
                except ValueError:
                    continue
            else:
                return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(default_timezone))
    return parsed.astimezone(UTC)


def _normalize_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if hasattr(value, "date") and callable(value.date):
        try:
            result = value.date()
            if isinstance(result, date):
                return result
        except (TypeError, ValueError):
            pass
    if isinstance(value, str):
        try:
            return date.fromisoformat(value.strip()[:10].replace("/", "-"))
        except ValueError:
            return None
    return None


def _row_quote(
    product: ProductDefinition,
    row: dict[str, Any],
    *,
    fetched_at: datetime,
    default_timezone: str = "Asia/Shanghai",
    mapped_contract: str | None = None,
) -> GlobalMarketRawQuote:
    source_symbol = _symbol(
        _pick(row, "代码", "symbol", "code", "dm", "合约", "contract", "source_symbol")
    )
    quoted_at = _normalize_datetime(
        _pick(row, "最新行情时间", "行情时间", "quoted_at", "timestamp", "time"),
        default_timezone,
    )
    latest = _number(_pick(row, "最新价", "最新值", "last", "current_price", "close"))
    previous = _number(
        _pick(row, "昨收价", "昨结", "previous", "last_close", "last_settle_price")
    )
    change = _number(_pick(row, "涨跌额", "change", "price_change"))
    change_percent = _number(_pick(row, "涨跌幅", "change_percent", "price_change_percent"))
    if change is None and latest is not None and previous not in (None, 0):
        change = latest - previous
    if change_percent is None and change is not None and previous not in (None, 0):
        change_percent = change / previous * 100
    return GlobalMarketRawQuote(
        product_id=product.id,
        source_symbol=source_symbol,
        latest=latest,
        previous=previous,
        change=change,
        change_percent=change_percent,
        quoted_at=quoted_at,
        fetched_at=fetched_at,
        mapped_contract=mapped_contract,
    )


def _find_exact_row(
    rows: list[dict[str, Any]], symbols: tuple[str, ...]
) -> dict[str, Any] | None:
    allowed = {item.upper() for item in symbols}
    for row in rows:
        current = _symbol(_pick(row, "代码", "symbol", "code", "dm", "合约", "contract"))
        if current in allowed:
            return row
    return None


INDEX_IDENTITY_TOKENS: dict[str, tuple[str, ...]] = {
    "HSI": ("恒生", "hang seng"),
    "N225": ("日经", "nikkei"),
    "KS11": ("韩国综合", "kospi"),
    "DJIA": ("道琼斯", "dow jones"),
    "SPX": ("标普", "s&p", "s&p 500"),
    "UDI": ("美元指数", "dollar index"),
}


def _verified_index_row(product: ProductDefinition, row: dict[str, Any]) -> bool:
    """Block a code when its returned name cannot prove the requested identity."""
    name = (_text(_pick(row, "名称", "name", "title")) or "").lower()
    source_symbol = (product.source_symbol or "").upper()
    if product.display_code == "IXIC":
        return ("纳斯达克" in name or "nasdaq" in name) and "100" not in name
    tokens = INDEX_IDENTITY_TOKENS.get(source_symbol)
    return bool(tokens and any(token in name for token in tokens))


COMMODITY_IDENTITY_TOKENS: dict[str, tuple[str, ...]] = {
    "XAU": ("伦敦金", "london gold"),
    "XAG": ("伦敦银", "london silver"),
    "GC00Y": ("comex", "黄金"),
    "SI00Y": ("comex", "白银"),
    "B00Y": ("布伦特", "brent"),
    "CL00Y": ("nymex", "原油", "wti"),
}


def _verified_commodity_row(product: ProductDefinition, row: dict[str, Any]) -> bool:
    if not product.source_symbol:
        return False
    name = (_text(_pick(row, "名称", "symbol", "name", "title")) or "").lower()
    tokens = COMMODITY_IDENTITY_TOKENS.get(product.source_symbol.upper())
    return bool(tokens and any(token in name for token in tokens))


def _find_foreign_mapping_row(
    rows: list[dict[str, Any]], product: ProductDefinition
) -> dict[str, Any] | None:
    allowed = {item.upper() for item in product.source_symbols}
    for row in rows:
        source_symbol = _symbol(_pick(row, "code", "代码"))
        if source_symbol not in allowed:
            continue
        if _verified_commodity_row(product, row):
            return row
    return None


def _foreign_spot_quote(
    product: ProductDefinition,
    row: dict[str, Any],
    *,
    source_symbol: str,
    fetched_at: datetime,
) -> GlobalMarketRawQuote:
    latest = _number(_pick(row, "最新价", "current_price", "last"))
    previous = _number(_pick(row, "昨日结算价", "last_settle_price", "previous"))
    change = _number(_pick(row, "涨跌额", "change", "price_change"))
    change_percent = _number(_pick(row, "涨跌幅", "change_percent", "price_change_percent"))
    if change is None and latest is not None and previous not in (None, 0):
        change = latest - previous
    if change_percent is None and change is not None and previous not in (None, 0):
        change_percent = change / previous * 100

    quoted_at = None
    as_of_date = _normalize_date(_pick(row, "日期", "date", "as_of_date"))
    clock = _text(_pick(row, "行情时间", "time"))
    if as_of_date is not None and clock:
        quoted_at = _normalize_datetime(
            f"{as_of_date.isoformat()} {clock[:8]}",
            default_timezone=SINA_FOREIGN_QUOTE_TIMEZONE,
        )
    return GlobalMarketRawQuote(
        product_id=product.id,
        source_symbol=source_symbol,
        latest=latest,
        previous=previous,
        change=change,
        change_percent=change_percent,
        quoted_at=quoted_at,
        as_of_date=as_of_date,
        fetched_at=fetched_at,
    )


def parse_main_contracts(value: Any) -> list[str]:
    """Return normalized contract codes from AKShare's comma-delimited response."""
    if isinstance(value, str):
        candidates = value.split(",")
    elif isinstance(value, (list, tuple, set)):
        candidates = list(value)
    else:
        return []
    result: list[str] = []
    for candidate in candidates:
        normalized = _symbol(candidate)
        if normalized and re.fullmatch(r"[A-Z]{1,3}\d{3,6}", normalized):
            result.append(normalized)
    return list(dict.fromkeys(result))


def choose_main_contract(contracts: list[str], product_code: str) -> str | None:
    prefix = product_code.upper()
    matches = [contract for contract in contracts if contract.startswith(prefix)]
    return matches[0] if matches else None


class AkshareGlobalMarketAdapter:
    """Thread-boundary adapter for the synchronous AKShare API."""

    version = AKSHARE_VERSION

    _EASTMONEY_GLOBAL_INDEX_URLS = (
        "https://push2delay.eastmoney.com/api/qt/clist/get",
        "https://push2.eastmoney.com/api/qt/clist/get",
    )
    _EASTMONEY_GLOBAL_FUTURES_URL = (
        "https://futsseapi.eastmoney.com/list/"
        "COMEX,NYMEX,COBOT,SGX,NYBOT,LME,MDEX,TOCOM,IPE"
    )
    _SINA_FOREIGN_QUOTES_URL = "https://hq.sinajs.cn/"
    _SINA_DOMESTIC_QUOTES_URL = "https://hq.sinajs.cn/"
    _SINA_DOMESTIC_MAIN_CONTRACT_URL = (
        "https://vip.stock.finance.sina.com.cn/quotes_service/"
        "api/json_v2.php/Market_Center.getHQFuturesData"
    )
    _DIRECT_HTTP_FUNCTIONS = frozenset(
        {
            "index_global_spot_em",
            "forex_spot_em",
            "futures_global_spot_em",
            "futures_foreign_commodity_realtime",
            "match_main_contract",
            "futures_zh_spot",
        }
    )

    def __init__(self, timeout_seconds: float = 30) -> None:
        self.timeout_seconds = timeout_seconds

    def _http_timeout(self) -> httpx.Timeout:
        # AKShare's commodity functions issue many requests without passing a
        # timeout.  Keep each direct request bounded so one bad upstream node
        # cannot hold the scheduler indefinitely.
        request_timeout = min(max(self.timeout_seconds, 5.0), 12.0)
        return httpx.Timeout(
            connect=min(request_timeout, 8.0),
            read=request_timeout,
            write=request_timeout,
            pool=request_timeout,
        )

    def _http_json(
        self,
        url: str,
        *,
        params: dict[str, str],
        headers: dict[str, str] | None = None,
    ) -> Any:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                with httpx.Client(
                    timeout=self._http_timeout(),
                    follow_redirects=True,
                    trust_env=True,
                ) as client:
                    response = client.get(url, params=params, headers=headers)
                    response.raise_for_status()
                    return response.json()
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                if attempt == 0:
                    time.sleep(0.2)
        raise RuntimeError(f"HTTP JSON request failed: {url}") from last_error

    def _http_text(
        self,
        url: str,
        *,
        params: dict[str, str],
        headers: dict[str, str] | None = None,
    ) -> str:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                with httpx.Client(
                    timeout=self._http_timeout(),
                    follow_redirects=True,
                    trust_env=True,
                ) as client:
                    response = client.get(url, params=params, headers=headers)
                    response.raise_for_status()
                    return response.text
            except httpx.HTTPError as exc:
                last_error = exc
                if attempt == 0:
                    time.sleep(0.2)
        raise RuntimeError(f"HTTP text request failed: {url}") from last_error

    def _direct_index_global_spot_em(self) -> list[dict[str, Any]]:
        """Fetch global indices through Eastmoney's delay-capable endpoint.

        AKShare 1.18.84 only uses ``push2.eastmoney.com`` for this call.  Some
        proxy routes return a gateway error there while the equivalent
        ``push2delay`` endpoint remains available and returns the same quote
        fields, including the UDI dollar index record.
        """
        params = {
            "np": "2",
            "fltt": "1",
            "invt": "2",
            "fs": (
                "i:1.000001,i:0.399001,i:0.399005,i:0.399006,i:1.000300,i:100.HSI,"
                "i:100.HSCEI,i:124.HSCCI,i:100.TWII,i:100.N225,i:100.KOSPI200,"
                "i:100.KS11,i:100.STI,i:100.SENSEX,i:100.KLSE,i:100.SET,i:100.PSI,"
                "i:100.KSE100,i:100.VNINDEX,i:100.JKSE,i:100.CSEALL,i:100.SX5E,"
                "i:100.FTSE,i:100.MCX,i:100.AXX,i:100.FCHI,i:100.GDAXI,i:100.RTS,"
                "i:100.IBEX,i:100.PSI20,i:100.OMXC20,i:100.BFX,i:100.AEX,i:100.WIG,"
                "i:100.OMXSPI,i:100.SSMI,i:100.HEX,i:100.OSEBX,i:100.ATX,i:100.MIB,"
                "i:100.ASE,i:100.ICEXI,i:100.PX,i:100.ISEQ,i:100.DJIA,i:100.SPX,"
                "i:100.NDX,i:100.TSX,i:100.BVSP,i:100.MXX,i:100.AS51,i:100.AORD,"
                "i:100.NZ50,i:100.UDI,i:100.BDI,i:100.CRB"
            ),
            "fields": "f12,f13,f14,f292,f1,f2,f4,f3,f152,f17,f18,f15,f16,f7,f124",
            "fid": "f3",
            "pn": "1",
            "pz": "200",
            "po": "1",
            "dect": "1",
            "wbp2u": "|0|0|0|web",
        }
        payload: Any = None
        last_error: Exception | None = None
        for url in self._EASTMONEY_GLOBAL_INDEX_URLS:
            try:
                payload = self._http_json(
                    url,
                    params=params,
                    headers={
                        "Referer": "https://quote.eastmoney.com/",
                        "User-Agent": "Mozilla/5.0",
                    },
                )
                break
            except Exception as exc:  # noqa: BLE001 - try the alternate Eastmoney host
                last_error = exc
        data = payload.get("data") if isinstance(payload, dict) else None
        diff = data.get("diff") if isinstance(data, dict) else None
        raw_rows = list(diff.values()) if isinstance(diff, dict) else diff
        if not isinstance(raw_rows, list) or not raw_rows:
            raise ValueError("Eastmoney global index response has no rows") from last_error

        def scaled(value: Any) -> float | None:
            number = _number(value)
            return number / 100 if number is not None else None

        def quote_time(value: Any) -> datetime | None:
            timestamp = _number(value)
            if timestamp is None:
                return None
            try:
                return datetime.fromtimestamp(timestamp, tz=UTC)
            except (OverflowError, OSError, ValueError):
                return None

        return [
            {
                "code": row.get("f12"),
                "name": row.get("f14"),
                "last": scaled(row.get("f2")),
                "change": scaled(row.get("f4")),
                "change_percent": scaled(row.get("f3")),
                "previous": scaled(row.get("f18")),
                "quoted_at": quote_time(row.get("f124")),
            }
            for row in raw_rows
            if isinstance(row, dict)
        ]

    def _direct_futures_global_spot_em(self) -> list[dict[str, Any]]:
        """Fetch all international futures in one bounded Eastmoney request.

        AKShare 1.18.84 requests this endpoint page-by-page with a page size of
        20 and no request timeout.  Eastmoney accepts a larger page size, so a
        direct call is both faster and less likely to be interrupted by the
        scheduler timeout.
        """
        params = {
            "orderBy": "dm",
            "sort": "desc",
            "pageSize": "1000",
            "pageIndex": "0",
            "token": "58b2fa8f54638b60b87d69b31969089c",
            "field": "dm,sc,name,p,zsjd,zde,zdf,f152,o,h,l,zjsj,vol,wp,np,ccl",
            "blockName": "callback",
        }
        payload = self._http_json(
            self._EASTMONEY_GLOBAL_FUTURES_URL,
            params=params,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        if not isinstance(payload, dict):
            raise ValueError("Eastmoney global futures response is not an object")

        raw_rows = payload.get("list")
        if not isinstance(raw_rows, list):
            raise ValueError("Eastmoney global futures response has no list")

        total = _number(payload.get("total")) or len(raw_rows)
        page_index = 0
        while len(raw_rows) < int(total) and page_index < 10:
            page_index += 1
            page_params = params | {"pageIndex": str(page_index)}
            page_payload = self._http_json(
                self._EASTMONEY_GLOBAL_FUTURES_URL,
                params=page_params,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            page_rows = page_payload.get("list") if isinstance(page_payload, dict) else None
            if not isinstance(page_rows, list) or not page_rows:
                break
            raw_rows.extend(page_rows)

        return [
            {
                "code": row.get("dm"),
                "name": row.get("name"),
                "last": row.get("p"),
                "change": row.get("zde"),
                "change_percent": row.get("zdf"),
                "last_settle_price": row.get("zjsj"),
            }
            for row in raw_rows
            if isinstance(row, dict)
        ]

    def _direct_forex_spot_em(self) -> list[dict[str, Any]]:
        """Fetch the requested CNH crosses from Eastmoney's FX endpoint.

        This is deliberately a separate transport from the global-index call:
        UDI and CNH crosses have different upstream payloads and should be able
        to succeed independently inside the FX group.
        """
        params = {
            "np": "1",
            "fltt": "2",
            "invt": "2",
            "fs": "m:119,m:120,m:133",
            "fields": "f12,f13,f14,f1,f2,f4,f3,f152,f17,f18,f15,f16",
            "fid": "f3",
            "pn": "1",
            "pz": "100",
            "po": "1",
            "dect": "1",
            "wbp2u": "|0|0|0|web",
        }
        raw_rows: list[dict[str, Any]] = []
        last_error: Exception | None = None
        required_codes = {
            product.source_symbol
            for product in PRODUCTS_BY_GROUP["fx"]
            if product.display_code != "USDIND" and product.source_symbol
        }
        for url in self._EASTMONEY_GLOBAL_INDEX_URLS:
            try:
                raw_rows = []
                for page in range(1, 4):
                    payload = self._http_json(
                        url,
                        params=params | {"pn": str(page)},
                        headers={
                            "Referer": "https://quote.eastmoney.com/",
                            "User-Agent": "Mozilla/5.0",
                        },
                    )
                    data = payload.get("data") if isinstance(payload, dict) else None
                    page_rows = data.get("diff") if isinstance(data, dict) else None
                    if isinstance(page_rows, dict):
                        page_rows = list(page_rows.values())
                    if not isinstance(page_rows, list) or not page_rows:
                        break
                    raw_rows.extend(row for row in page_rows if isinstance(row, dict))
                    found_codes = {str(row.get("f12")) for row in raw_rows}
                    if required_codes.issubset(found_codes):
                        break
                break
            except Exception as exc:  # noqa: BLE001 - try the alternate Eastmoney host
                last_error = exc
                raw_rows = []
        if not isinstance(raw_rows, list) or not raw_rows:
            raise ValueError("Eastmoney forex response has no rows") from last_error
        return [
            {
                "code": row.get("f12"),
                "name": row.get("f14"),
                "last": row.get("f2"),
                "change": row.get("f4"),
                "change_percent": row.get("f3"),
                "previous": row.get("f18"),
            }
            for row in raw_rows
            if isinstance(row, dict)
        ]

    @staticmethod
    def _sina_clock(value: Any) -> str | None:
        normalized = _text(value)
        if normalized is None:
            return None
        digits = re.sub(r"\D", "", normalized)
        if len(digits) == 6:
            return f"{digits[:2]}:{digits[2:4]}:{digits[4:]}"
        return normalized

    def _direct_futures_foreign_commodity_realtime(
        self, symbol: str | list[str]
    ) -> list[dict[str, Any]]:
        symbols = symbol.split(",") if isinstance(symbol, str) else symbol
        rows: list[dict[str, Any]] = []
        names = {"XAU": "london gold", "XAG": "london silver"}
        last_error: Exception | None = None
        for item in symbols:
            current_symbol = item.strip().upper()
            if not current_symbol:
                continue
            try:
                text = self._http_text(
                    self._SINA_FOREIGN_QUOTES_URL,
                    params={"list": f"hf_{current_symbol}"},
                    headers={
                        "Accept": "*/*",
                        "Referer": "https://finance.sina.com.cn/",
                        "User-Agent": "Mozilla/5.0",
                    },
                )
            except Exception as exc:  # noqa: BLE001 - isolate one quote from the batch
                last_error = exc
                continue
            match = re.search(
                rf'hq_str_hf_{re.escape(current_symbol)}="([^"]*)"',
                text,
            )
            if match is None:
                continue
            values = match.group(1).split(",")
            if len(values) < 13 or not _text(values[0]):
                continue
            raw_name = values[13] if len(values) > 13 else current_symbol
            rows.append(
                {
                    "name": f"{names.get(current_symbol, current_symbol)} {raw_name}",
                    "current_price": values[0],
                    "last_settle_price": values[7],
                    "time": self._sina_clock(values[6]),
                    "date": values[12],
                }
            )
        if not rows:
            raise ValueError("Sina foreign commodity response has no quotes") from last_error
        return rows

    def _direct_match_main_contract(self, exchange: str = "shfe") -> str:
        if exchange.lower() != "shfe":
            raise ValueError(f"Direct main-contract transport only supports SHFE: {exchange}")
        nodes = {"AU": "hj_qh", "AG": "by_qh"}
        selected: list[str] = []
        for product_code, node in nodes.items():
            try:
                payload = self._http_json(
                    self._SINA_DOMESTIC_MAIN_CONTRACT_URL,
                    params={
                        "page": "1",
                        "num": "5",
                        "sort": "position",
                        "asc": "0",
                        "node": node,
                        "base": "futures",
                    },
                    headers={"User-Agent": "Mozilla/5.0"},
                )
            except Exception:
                continue
            if not isinstance(payload, list):
                continue
            contract = next(
                (
                    _symbol(row.get("symbol"))
                    for row in payload
                    if isinstance(row, dict)
                    and re.fullmatch(rf"{product_code}\d{{3,6}}", _symbol(row.get("symbol")) or "")
                ),
                None,
            )
            if contract:
                selected.append(contract)
        if not selected:
            raise ValueError("Sina did not return AU or AG main contracts")
        return ",".join(selected)

    def _direct_futures_zh_spot(
        self,
        symbol: str = "V2309",
        market: str = "CF",
        adjust: str = "0",
    ) -> list[dict[str, Any]]:
        del adjust
        if market != "CF":
            raise ValueError(f"Direct domestic futures transport only supports CF: {market}")
        rows: list[dict[str, Any]] = []
        for contract in (item.strip().upper() for item in symbol.split(",")):
            if not contract:
                continue
            try:
                text = self._http_text(
                    self._SINA_DOMESTIC_QUOTES_URL,
                    params={"list": f"nf_{contract}"},
                    headers={
                        "Accept": "*/*",
                        "Referer": "https://vip.stock.finance.sina.com.cn/",
                        "User-Agent": "Mozilla/5.0",
                    },
                )
            except Exception:
                continue
            match = re.search(rf'hq_str_nf_{re.escape(contract)}="([^"]*)"', text)
            if match is None:
                continue
            values = match.group(1).split(",")
            if len(values) < 11 or not _text(values[8]):
                continue
            rows.append(
                {
                    "contract": contract,
                    "symbol": contract,
                    "name": values[0],
                    "current_price": values[8],
                    "previous": values[10],
                    "time": self._sina_clock(values[1]),
                }
            )
        if not rows:
            raise ValueError("Sina domestic futures response has no quotes")
        return rows

    @staticmethod
    def _load_akshare() -> Any:
        try:
            return importlib.import_module("akshare")
        except ImportError as exc:
            raise GlobalMarketAdapterError("unsupported", "当前运行环境未安装 AKShare") from exc

    async def _call(self, function_name: str, *args: Any) -> Any:
        function: Callable[..., Any] | None = None
        if function_name in self._DIRECT_HTTP_FUNCTIONS:
            function = getattr(self, f"_direct_{function_name}", None)
        if function is None:
            akshare = self._load_akshare()
            function = getattr(akshare, function_name, None)
        if function is None:
            raise GlobalMarketAdapterError(
                "unsupported", f"AKShare 未提供接口 {function_name}"
            )
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(function, *args),
                timeout=self.timeout_seconds,
            )
        except TimeoutError as exc:
            raise GlobalMarketAdapterError(
                "timeout", f"AKShare 接口 {function_name} 请求超时"
            ) from exc
        except Exception as exc:  # noqa: BLE001 - third-party adapter boundary
            logger.warning(
                "AKShare global market request failed",
                extra={"function": function_name, "error_type": type(exc).__name__},
            )
            raise GlobalMarketAdapterError(
                "upstream_unavailable", f"AKShare 接口 {function_name} 暂时不可用"
            ) from exc
        if not _rows(result) and not (isinstance(result, str) and result.strip()):
            raise GlobalMarketAdapterError(
                "valid_empty", f"AKShare 接口 {function_name} 返回空数据"
            )
        return result

    async def fetch_group(self, group: GlobalMarketGroup) -> GlobalMarketFetchResult:
        if group == "indices":
            return await self._fetch_indices()
        if group == "fx":
            return await self._fetch_fx()
        if group == "commodities":
            return await self._fetch_commodities()
        return await self._fetch_yields()

    async def _fetch_indices(self) -> GlobalMarketFetchResult:
        fetched_at = datetime.now(UTC)
        frame = await self._call("index_global_spot_em")
        rows = _rows(frame)
        result = GlobalMarketFetchResult(group="indices", fetched_at=fetched_at)
        for product in PRODUCTS_BY_GROUP["indices"]:
            row = _find_exact_row(rows, product.source_symbols)
            if row is None:
                result.missing_reasons[product.id] = "上游返回中未找到已验证供应商代码"
                continue
            if not _verified_index_row(product, row):
                result.missing_reasons[product.id] = "供应商代码与指数名称无法完成身份校验"
                continue
            result.quotes[product.id] = _row_quote(
                product,
                row,
                fetched_at=fetched_at,
                default_timezone=product.market_timezone or "Asia/Shanghai",
            )
        return result

    async def _fetch_fx(self) -> GlobalMarketFetchResult:
        fetched_at = datetime.now(UTC)
        index_frame, fx_frame = await asyncio.gather(
            self._call("index_global_spot_em"),
            self._call("forex_spot_em"),
            return_exceptions=True,
        )
        result = GlobalMarketFetchResult(group="fx", fetched_at=fetched_at)
        if isinstance(index_frame, BaseException):
            result.errors.append(f"美元指数: {self._error_code(index_frame)}")
            index_rows: list[dict[str, Any]] = []
        else:
            index_rows = _rows(index_frame)
        if isinstance(fx_frame, BaseException):
            result.errors.append(f"汇率: {self._error_code(fx_frame)}")
            fx_rows: list[dict[str, Any]] = []
        else:
            fx_rows = _rows(fx_frame)
        for product in PRODUCTS_BY_GROUP["fx"]:
            source_rows = index_rows if product.display_code == "USDIND" else fx_rows
            row = _find_exact_row(source_rows, product.source_symbols)
            if row is None:
                result.missing_reasons[product.id] = "上游返回中未找到已验证供应商代码"
                continue
            result.quotes[product.id] = _row_quote(
                product,
                row,
                fetched_at=fetched_at,
                default_timezone="Asia/Shanghai",
            )
        return result

    async def _fetch_commodities(self) -> GlobalMarketFetchResult:
        fetched_at = datetime.now(UTC)
        result = GlobalMarketFetchResult(group="commodities", fetched_at=fetched_at)
        global_task = asyncio.create_task(self._call("futures_global_spot_em"))
        london_task = asyncio.create_task(self._fetch_london_spot(fetched_at))
        main_task = asyncio.create_task(self._fetch_domestic_main_contracts())
        global_result, london_result, main_result = await asyncio.gather(
            global_task,
            london_task,
            main_task,
            return_exceptions=True,
        )

        if isinstance(global_result, BaseException):
            result.errors.append(f"海外商品: {self._error_code(global_result)}")
        else:
            rows = _rows(global_result)
            for product in PRODUCTS_BY_GROUP["commodities"]:
                if product.display_code in {"XAUUSD", "XAGUSD", "AU", "AG"}:
                    continue
                if not product.source_symbols:
                    result.missing_reasons[product.id] = (
                        "AKShare 当前返回中未发现经身份验证的伦敦现货记录"
                    )
                    continue
                row = _find_exact_row(rows, product.source_symbols)
                if row is None:
                    result.missing_reasons[product.id] = "未找到已验证的连续合约供应商代码"
                    continue
                if not _verified_commodity_row(product, row):
                    result.missing_reasons[product.id] = "供应商代码与商品名称无法完成身份校验"
                    continue
                result.quotes[product.id] = _row_quote(
                    product,
                    row,
                    fetched_at=fetched_at,
                    default_timezone=product.market_timezone or "Asia/Shanghai",
                    mapped_contract=_symbol(
                        _pick(row, "代码", "symbol", "code", "dm", "合约", "contract")
                    ),
                )

        if isinstance(london_result, BaseException):
            result.errors.append(f"伦敦现货: {self._error_code(london_result)}")
            for product in PRODUCTS_BY_GROUP["commodities"]:
                if product.display_code in {"XAUUSD", "XAGUSD"}:
                    result.missing_reasons[product.id] = (
                        "AKShare 新浪外盘接口未返回经身份验证的伦敦现货"
                    )
        else:
            result.quotes.update(london_result.quotes)
            result.missing_reasons.update(london_result.missing_reasons)
            result.errors.extend(london_result.errors)

        if isinstance(main_result, BaseException):
            result.errors.append(f"国内主连: {self._error_code(main_result)}")
        else:
            for quote in main_result:
                result.quotes[quote.product_id] = quote
        return result

    async def _fetch_london_spot(self, fetched_at: datetime) -> GlobalMarketFetchResult:
        result = GlobalMarketFetchResult(group="commodities", fetched_at=fetched_at)
        products = tuple(
            product
            for product in PRODUCTS_BY_GROUP["commodities"]
            if product.display_code in {"XAUUSD", "XAGUSD"}
        )
        mapping_frame = await self._call("futures_hq_subscribe_exchange_symbol")
        mapping_rows = _rows(mapping_frame)
        selected: dict[str, str] = {}
        for product in products:
            row = _find_foreign_mapping_row(mapping_rows, product)
            if row is None:
                result.missing_reasons[product.id] = "新浪外盘品种表未返回经身份验证的伦敦现货代码"
                continue
            selected[product.id] = _symbol(_pick(row, "code", "代码")) or ""

        selected = {product_id: symbol for product_id, symbol in selected.items() if symbol}
        if not selected:
            return result

        frame = await self._call(
            "futures_foreign_commodity_realtime",
            ",".join(selected.values()),
        )
        rows = _rows(frame)
        products_by_id = {product.id: product for product in products}
        for product_id, source_symbol in selected.items():
            product = products_by_id[product_id]
            row = next(
                (candidate for candidate in rows if _verified_commodity_row(product, candidate)),
                None,
            )
            if row is None:
                result.missing_reasons[product.id] = "新浪外盘行情未返回经身份验证的伦敦现货记录"
                continue
            result.quotes[product.id] = _foreign_spot_quote(
                product,
                row,
                source_symbol=source_symbol,
                fetched_at=fetched_at,
            )
        return result

    async def _fetch_domestic_main_contracts(self) -> list[GlobalMarketRawQuote]:
        fetched_at = datetime.now(UTC)
        raw_contracts = await self._call("match_main_contract", "shfe")
        contracts = parse_main_contracts(raw_contracts)
        selected = {
            code: choose_main_contract(contracts, code)
            for code in ("AU", "AG")
        }
        selected = {code: contract for code, contract in selected.items() if contract}
        if not selected:
            raise GlobalMarketAdapterError("mapping_failed", "SHFE 主力合约映射未返回 AU 或 AG")
        frame = await self._call(
            "futures_zh_spot",
            ",".join(selected.values()),
            "CF",
            "0",
        )
        rows = _rows(frame)
        quotes: list[GlobalMarketRawQuote] = []
        products_by_code = {
            product.display_code: product
            for product in PRODUCTS_BY_GROUP["commodities"]
            if product.display_code in {"AU", "AG"}
        }
        for code, contract in selected.items():
            product = products_by_code[code]
            row = _find_exact_row(rows, (contract,))
            if row is None:
                continue
            quote = _row_quote(
                product,
                row,
                fetched_at=fetched_at,
                default_timezone="Asia/Shanghai",
                mapped_contract=contract,
            )
            if quote.quoted_at is None:
                # Sina only returns a clock for this endpoint. Keep the fallback explicit:
                # the freshness calculator can still use fetched_at.
                clock = _text(_pick(row, "time", "时间"))
                if clock:
                    try:
                        parsed_clock = datetime.strptime(clock[:8], "%H:%M:%S").time()
                    except ValueError:
                        parsed_clock = None
                    if parsed_clock is not None:
                        local_date = datetime.now(ZoneInfo("Asia/Shanghai")).date()
                        quote.quoted_at = datetime.combine(
                            local_date,
                            parsed_clock,
                            ZoneInfo("Asia/Shanghai"),
                        ).astimezone(UTC)
            quotes.append(quote)
        return quotes

    async def _fetch_yields(self) -> GlobalMarketFetchResult:
        fetched_at = datetime.now(UTC)
        products = PRODUCTS_BY_GROUP["yields"]
        result = GlobalMarketFetchResult(group="yields", fetched_at=fetched_at)

        async def fetch_one(product: ProductDefinition) -> tuple[ProductDefinition, Any]:
            function = (
                "bond_gb_zh_sina"
                if product.display_code.startswith("CN")
                else "bond_gb_us_sina"
            )
            return product, await self._call(function, product.source_symbol)

        fetched = await asyncio.gather(
            *(fetch_one(product) for product in products),
            return_exceptions=True,
        )
        for entry in fetched:
            if isinstance(entry, BaseException):
                result.errors.append(self._error_code(entry))
                continue
            product, frame = entry
            rows = _rows(frame)
            dated_rows = []
            for row in rows:
                row_date = _normalize_date(_pick(row, "date", "日期", "as_of_date"))
                close = _number(_pick(row, "close", "收盘", "最新价", "value"))
                if row_date is not None and close is not None:
                    dated_rows.append((row_date, close, row))
            dated_rows.sort(key=lambda item: item[0], reverse=True)
            if not dated_rows:
                result.missing_reasons[product.id] = "国债收益率序列没有有效日期和收盘值"
                continue
            latest_date, latest_value, latest_row = dated_rows[0]
            previous = dated_rows[1][1] if len(dated_rows) > 1 else None
            result.quotes[product.id] = GlobalMarketRawQuote(
                product_id=product.id,
                source_symbol=product.source_symbol,
                latest=latest_value,
                previous=previous,
                quoted_at=None,
                as_of_date=latest_date,
                fetched_at=fetched_at,
                source_status="ok",
                missing_reason=None,
            )
            del latest_row
        return result

    @staticmethod
    def _error_code(error: BaseException) -> str:
        if isinstance(error, GlobalMarketAdapterError):
            return error.code
        return type(error).__name__
