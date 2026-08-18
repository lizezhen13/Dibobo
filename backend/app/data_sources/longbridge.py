import asyncio
import base64
import hashlib
import hmac
import json
import logging
import math
import re
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

LONGBRIDGE_DEFAULT_BASE_URL = "https://openapi.longbridge.cn"

LONGBRIDGE_CAPABILITIES: dict[str, Literal["supported", "unsupported", "partial"]] = {
    "quote": "supported",
    "quote_realtime": "partial",
    "fundamental": "supported",
    "screener": "supported",
    "market": "supported",
    "market_temperature": "supported",
    "content": "supported",
    "financial_calendar": "supported",
}

_CAPABILITY_GROUPS = {
    "quote": ("quote", "quote_realtime"),
    "fundamental": ("fundamental",),
    "market": ("market",),
    "market_temperature": ("market_temperature",),
    "content": ("content",),
    "financial_calendar": ("financial_calendar",),
}


class LongbridgeError(Exception):
    def __init__(self, user_message: str, *, code: int = 5003) -> None:
        super().__init__(user_message)
        self.user_message = user_message
        self.code = code


@dataclass(frozen=True)
class LongbridgeProbeResult:
    status: Literal["success", "failed"]
    capabilities: dict[str, Literal["supported", "unsupported", "partial"]]
    message: str


@dataclass(frozen=True)
class LongbridgeMarketTemperature:
    temperature: int
    description: str
    valuation: int
    sentiment: int
    updated_at: datetime


@dataclass(frozen=True)
class OAuthClientRegistration:
    client_id: str
    client_secret: str | None


@dataclass(frozen=True)
class OAuthTokenResponse:
    access_token: str
    refresh_token: str | None
    expires_in: int | None
    token_type: str | None


@dataclass(frozen=True, slots=True)
class LongbridgeScreenerItem:
    """A normalized row returned by Longbridge's CN stock screener."""

    thscode: str
    ticker: str
    name: str
    exchange: Literal["SH", "SZ"]
    market_cap: float | None = None
    dividend_yield: float | None = None
    pb: float | None = None
    pe_ttm: float | None = None
    latest: float | None = None
    change_percent: float | None = None
    industry: str | None = None
    status: str | None = None
    quoted_at: datetime | None = None

    @property
    def incomplete(self) -> bool:
        return any(
            value is None
            for value in (
                self.market_cap,
                self.dividend_yield,
                self.pb,
                self.pe_ttm,
            )
        )


@dataclass(frozen=True, slots=True)
class LongbridgeScreenerPage:
    items: list[LongbridgeScreenerItem]
    total: int
    page: int
    size: int


def _screener_value(item: dict[str, Any], *keys: str) -> object:
    lookup_keys = (*keys, *(f"filter_{key}" for key in keys if not key.startswith("filter_")))
    for key in lookup_keys:
        if key in item and item[key] is not None:
            return item[key]

    indicators = item.get("indicators")
    if isinstance(indicators, dict):
        for key in lookup_keys:
            if key in indicators and indicators[key] is not None:
                return indicators[key]
    elif isinstance(indicators, list):
        aliases = set(keys)
        for indicator in indicators:
            if not isinstance(indicator, dict):
                continue
            indicator_key = indicator.get("key") or indicator.get("name")
            if isinstance(indicator_key, str):
                indicator_key = indicator_key.removeprefix("filter_")
            if indicator_key in aliases:
                return indicator.get("value")
    return None


def _screener_float(value: object) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, dict):
        value = value.get("value")
    if isinstance(value, str):
        normalized = value.strip().replace(",", "")
        for suffix in ("亿元", "亿", "%", "倍"):
            if normalized.endswith(suffix):
                normalized = normalized[: -len(suffix)]
                break
        if normalized in {"", "-", "--", "N/A", "NA", "null", "None"}:
            return None
        value = normalized
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _screener_market_cap(value: object, unit: str | None = None) -> float | None:
    """Normalize Longbridge market cap values to the product unit, 亿元."""
    raw_text = value.strip().lower() if isinstance(value, str) else ""
    parsed = _screener_float(value)
    if parsed is None:
        return None
    if "亿" in raw_text or "100m" in raw_text:
        return parsed
    if "bn" in raw_text or "billion" in raw_text:
        return parsed * 10
    if parsed >= 100_000_000:
        # The screener search response documents marketcap as base currency.
        return parsed / 100_000_000
    if unit is not None and _screener_unit_kind(unit) == "bn":
        return parsed * 10
    return parsed


def _screener_unit_kind(unit: str | None) -> str | None:
    if not unit:
        return None
    normalized = unit.strip().lower().replace(" ", "")
    if normalized in {"bn", "b", "billion", "十亿", "十亿美元"}:
        return "bn"
    if "亿" in normalized or "100m" in normalized or "hundredmillion" in normalized:
        return "yi"
    if normalized in {"元", "cny", "rmb", "base", "basecurrency"}:
        return "base"
    return None


def _screener_condition_bound(
    key: str,
    value: float,
    *,
    market_cap_unit: str | None = None,
) -> str:
    """Convert the product's 亿元 bound to Longbridge's current unit."""
    normalized = value
    if key == "marketcap":
        unit_kind = _screener_unit_kind(market_cap_unit) or "bn"
        if unit_kind == "bn":
            normalized = value / 10
        elif unit_kind == "base":
            normalized = value * 100_000_000
    return f"{normalized:g}"


def _screener_api_key(key: str) -> str:
    return key if key.startswith("filter_") else f"filter_{key}"


def _screener_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _screener_datetime(value: object) -> datetime | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp /= 1000
        try:
            return datetime.fromtimestamp(timestamp, tz=UTC)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        normalized = value.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)
    return None


def _normalize_screener_symbol(
    value: object,
    market: object | None = None,
) -> tuple[str, str, Literal["SH", "SZ"]] | None:
    raw = _screener_text(value)
    if raw is None:
        return None
    raw_upper = raw.upper()
    counter_match = re.fullmatch(r"(?:[A-Z]+/)?(SH|SZ|BJ)/(\d{6})", raw_upper)
    if counter_match is not None:
        raw_upper = f"{counter_match.group(2)}.{counter_match.group(1)}"
    normalized = raw_upper.replace("/", ".")
    if re.fullmatch(r"(?:SH|SZ|BJ)\.\d{6}", normalized):
        exchange, ticker = normalized.split(".", 1)
        normalized = f"{ticker}.{exchange}"
    elif re.fullmatch(r"\d{6}(?:SH|SZ|BJ)", normalized):
        normalized = f"{normalized[:6]}.{normalized[6:]}"
    elif re.fullmatch(r"\d{6}", normalized):
        exchange = (_screener_text(market) or "").upper()
        if exchange in {"SH", "SZ", "BJ"}:
            normalized = f"{normalized}.{exchange}"

    match = re.fullmatch(r"(\d{6})\.(SH|SZ|BJ)", normalized)
    if match is None or match.group(2) == "BJ":
        return None
    ticker, exchange = match.groups()
    return normalized, ticker, exchange  # type: ignore[return-value]


def _screener_is_suspended(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    normalized = (_screener_text(value) or "").lower()
    return any(token in normalized for token in ("停牌", "暂停", "suspend", "halt", "delist"))


def _screener_items(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    candidates: list[object] = [payload]
    data = payload.get("data")
    if isinstance(data, (dict, list)):
        candidates.insert(0, data)

    raw_items: list[dict[str, Any]] = []
    total: int | None = None
    for candidate in candidates:
        if isinstance(candidate, list):
            raw_items = [item for item in candidate if isinstance(item, dict)]
            break
        if not isinstance(candidate, dict):
            continue
        possible_items = candidate.get("items") or candidate.get("results") or candidate.get("list")
        if isinstance(possible_items, list):
            raw_items = [item for item in possible_items if isinstance(item, dict)]
            raw_total = candidate.get("total")
            total = int(raw_total) if isinstance(raw_total, (int, float)) else None
            break

    if total is None:
        raw_total = payload.get("total")
        total = int(raw_total) if isinstance(raw_total, (int, float)) else len(raw_items)
    return raw_items, max(total, len(raw_items))


def _normalize_screener_item(
    item: dict[str, Any],
    *,
    market_cap_unit: str | None = None,
) -> LongbridgeScreenerItem | None:
    market = _screener_value(item, "market", "exchange", "market_code")
    symbol = _normalize_screener_symbol(
        _screener_value(item, "symbol", "thscode", "security_id", "counter_id", "code"),
        market,
    )
    if symbol is None:
        return None
    thscode, ticker, exchange = symbol
    name = _screener_text(
        _screener_value(item, "name", "security_name", "stock_name", "counter_name")
    )
    if name is None:
        return None

    normalized_name = name.replace(" ", "").replace("\u3000", "").upper()
    status = _screener_text(
        _screener_value(item, "status", "security_status", "trading_status", "state")
    )
    suspended = _screener_value(item, "suspended", "is_suspended", "halted")
    if (
        normalized_name.lstrip("*").startswith("ST")
        or "退市" in name
        or _screener_is_suspended(status)
        or _screener_is_suspended(suspended)
    ):
        return None

    return LongbridgeScreenerItem(
        thscode=thscode,
        ticker=ticker,
        name=name,
        exchange=exchange,
        market_cap=_screener_market_cap(
            _screener_value(item, "marketcap", "market_cap"), market_cap_unit
        ),
        dividend_yield=_screener_float(
            _screener_value(item, "divyld", "dividend_yield", "dividend_yield_ttm")
        ),
        pb=_screener_float(_screener_value(item, "pbmrq", "pb_mrq", "pb")),
        pe_ttm=_screener_float(_screener_value(item, "pettm", "pe_ttm", "pe")),
        latest=_screener_float(
            _screener_value(item, "prevclose", "prev_close", "last_done", "latest", "price")
        ),
        change_percent=_screener_float(
            _screener_value(item, "prevchg", "change_percent", "change_pct")
        ),
        industry=_screener_text(_screener_value(item, "industry", "industry_name")),
        status=status,
        quoted_at=_screener_datetime(
            _screener_value(item, "quoted_at", "quote_time", "updated_at", "timestamp")
        ),
    )


def _upstream_error_code(payload: object) -> int | str | None:
    if not isinstance(payload, dict):
        return None
    raw_code = payload.get("code")
    if isinstance(raw_code, bool) or raw_code is None:
        return None
    if isinstance(raw_code, int):
        return raw_code
    if isinstance(raw_code, str):
        normalized = raw_code.strip()
        return normalized or None
    return str(raw_code)


def _upstream_error_message(payload: object) -> str | None:
    if not isinstance(payload, dict):
        return None

    candidates: list[object] = [
        payload.get("message"),
        payload.get("msg"),
        payload.get("error_description"),
        payload.get("error"),
    ]
    data = payload.get("data")
    if isinstance(data, dict):
        candidates.extend(
            (data.get("message"), data.get("msg"), data.get("error_description"))
        )
    for candidate in candidates:
        if not isinstance(candidate, str):
            continue
        normalized = " ".join(candidate.split())
        if normalized:
            return normalized[:240]
    return None


def _is_success_response_code(value: object) -> bool:
    return value is None or value == 0 or value == "0"


def _safe_error_message(status_code: int, payload: object) -> tuple[str, int]:
    upstream_code = _upstream_error_code(payload)
    upstream_message = _upstream_error_message(payload)
    numeric_code: int | None = None
    if isinstance(upstream_code, int):
        numeric_code = upstream_code
    elif isinstance(upstream_code, str) and upstream_code.isdigit():
        numeric_code = int(upstream_code)

    if status_code in {401, 403}:
        return "Longbridge 鉴权失败，请重新授权或检查 API 凭证", 2001
    if status_code == 429:
        return "Longbridge 访问频率受限，请稍后再试", 4001
    if status_code >= 500:
        if upstream_message:
            return f"Longbridge 服务暂时不可用：{upstream_message}", 5003
        return "Longbridge 服务暂时不可用，请稍后再试", 5003

    if numeric_code in {401, 401001, 401002, 403, 403001}:
        return "Longbridge 鉴权失败，请重新授权或检查 API 凭证", 2001
    if numeric_code in {429, 429001}:
        return "Longbridge 访问频率受限，请稍后再试", 4001
    if status_code == 400 or numeric_code in {400, 400001}:
        if upstream_message:
            return f"Longbridge 请求参数不符合接口要求：{upstream_message}", 3001
        return "Longbridge 请求参数不符合接口要求", 3001

    details: list[str] = []
    if upstream_code is not None:
        details.append(f"错误码 {upstream_code}")
    if upstream_message:
        details.append(upstream_message)
    if details:
        return f"Longbridge 返回业务错误（{'：'.join(details)}）", 5003
    return "Longbridge 返回了无法识别的业务错误", 5003


def _json_bytes(payload: object) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def build_legacy_signature(
    *,
    method: str,
    path: str,
    query: str,
    app_key: str,
    app_secret: str,
    access_token: str,
    timestamp: int,
    body: bytes = b"",
) -> str:
    signed_values = (
        f"authorization:{access_token}\n"
        f"x-api-key:{app_key}\n"
        f"x-timestamp:{timestamp}\n"
    )
    canonical = (
        f"{method.upper()}|{path}|{query}|{signed_values}"
        "authorization;x-api-key;x-timestamp|"
    )
    if body:
        canonical += hashlib.sha1(body).hexdigest()
    string_to_sign = f"HMAC-SHA256|{hashlib.sha1(canonical.encode()).hexdigest()}"
    return hmac.new(
        app_secret.encode(), string_to_sign.encode(), hashlib.sha256
    ).hexdigest()


def create_pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")
    return verifier, challenge


def build_oauth_authorization_url(
    *,
    base_url: str,
    client_id: str,
    redirect_uri: str,
    state: str,
    code_challenge: str,
) -> str:
    query = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": "3",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
    )
    return f"{base_url.rstrip('/')}/oauth2/authorize?{query}"


class LongbridgeHttpClient:
    def __init__(
        self,
        base_url: str,
        auth_type: Literal["api_key", "oauth"],
        credentials: dict[str, Any],
        timeout_seconds: float,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.auth_type = auth_type
        self.credentials = credentials
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Accept": "application/json"},
            timeout=timeout_seconds,
        )
        self._request_lock = asyncio.Lock()
        self._last_request_at = 0.0
        self._min_request_interval = 0.12

    async def __aenter__(self) -> "LongbridgeHttpClient":
        return self

    async def __aexit__(self, *_: object) -> None:
        await self._client.aclose()

    def _headers(self, method: str, path: str, query: str, body: bytes) -> dict[str, str]:
        if self.auth_type == "oauth":
            access_token = self.credentials.get("access_token")
            if not isinstance(access_token, str) or not access_token:
                raise LongbridgeError("Longbridge 尚未完成 OAuth 授权", code=2001)
            return {"Authorization": f"Bearer {access_token}"}

        app_key = self.credentials.get("app_key")
        app_secret = self.credentials.get("app_secret")
        access_token = self.credentials.get("access_token")
        if not all(
            isinstance(value, str) and value for value in (app_key, app_secret, access_token)
        ):
            raise LongbridgeError(
                "Longbridge API 凭证不完整，请填写 App Key、App Secret 和 Access Token",
                code=2001,
            )
        timestamp = int(time.time())
        return {
            "Authorization": access_token,
            "X-Api-Key": app_key,
            "X-Timestamp": str(timestamp),
            "X-Api-Signature": build_legacy_signature(
                method=method,
                path=path,
                query=query,
                app_key=app_key,
                app_secret=app_secret,
                access_token=access_token,
                timestamp=timestamp,
                body=body,
            ),
        }

    async def request_json(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        payload: object | None = None,
    ) -> dict[str, Any]:
        query = str(httpx.QueryParams(params or {}))
        body = _json_bytes(payload) if payload is not None else b""
        headers = self._headers(method, path, query, body)
        if payload is not None:
            headers["Content-Type"] = "application/json"

        async with self._request_lock:
            elapsed = time.monotonic() - self._last_request_at
            if elapsed < self._min_request_interval:
                await asyncio.sleep(self._min_request_interval - elapsed)
            self._last_request_at = time.monotonic()

        try:
            response = await self._client.request(
                method,
                path,
                params=params,
                content=body or None,
                headers=headers,
            )
        except httpx.TimeoutException as exc:
            raise LongbridgeError("Longbridge 响应超时，请稍后重试", code=5002) from exc
        except httpx.RequestError as exc:
            raise LongbridgeError(
                "Longbridge 暂时无法访问，请检查网络或节点地址", code=5003
            ) from exc

        try:
            response_payload = response.json()
        except ValueError as exc:
            raise LongbridgeError("Longbridge 返回了无法识别的响应", code=5003) from exc

        if response.status_code >= 400:
            logger.warning(
                "Longbridge upstream HTTP error",
                extra={
                    "status_code": response.status_code,
                    "upstream_code": _upstream_error_code(response_payload),
                    "upstream_message": _upstream_error_message(response_payload),
                    "path": path,
                },
            )
            message, code = _safe_error_message(response.status_code, response_payload)
            raise LongbridgeError(message, code=code)
        if not isinstance(response_payload, dict):
            raise LongbridgeError("Longbridge 返回了无法识别的响应", code=5003)

        code = response_payload.get("code")
        if not _is_success_response_code(code):
            logger.warning(
                "Longbridge upstream business error",
                extra={
                    "status_code": response.status_code,
                    "upstream_code": _upstream_error_code(response_payload),
                    "upstream_message": _upstream_error_message(response_payload),
                    "path": path,
                },
            )
            message, error_code = _safe_error_message(response.status_code, response_payload)
            raise LongbridgeError(message, code=error_code)
        return response_payload

    async def get_json(
        self, path: str, *, params: dict[str, str] | None = None
    ) -> dict[str, Any]:
        return await self.request_json("GET", path, params=params)

    async def probe(self) -> LongbridgeProbeResult:
        today = date.today()
        checks = (
            (
                "quote",
                "/v1/quote/get_security_list",
                {"market": "US", "category": "Overnight"},
            ),
            (
                "fundamental",
                "/v1/quote/financial-reports",
                {"symbol": "700.HK"},
            ),
            ("market", "/v1/quote/market-status", None),
            (
                "market_temperature",
                "/v1/quote/market_temperature",
                {"market": "CN"},
            ),
            ("content", "/v1/content/AAPL.US/news", None),
            (
                "financial_calendar",
                "/v1/quote/finance_calendar",
                {
                    "types[]": "report",
                    "date": today.isoformat(),
                    "date_end": (today + timedelta(days=7)).isoformat(),
                    "markets[]": "HK",
                },
            ),
        )

        async def run_check(
            category: str,
            path: str,
            params: dict[str, str] | None,
        ) -> tuple[str, LongbridgeError | None]:
            try:
                await self.get_json(path, params=params)
            except LongbridgeError as exc:
                return category, exc
            return category, None

        results = await asyncio.gather(*(run_check(*check) for check in checks))
        succeeded = {category for category, error in results if error is None}
        errors = [error for _, error in results if error is not None]

        if not succeeded:
            first_error = errors[0] if errors else None
            return LongbridgeProbeResult(
                status="failed",
                capabilities={},
                message=first_error.user_message if first_error else "Longbridge 连接测试失败",
            )

        capabilities = dict(LONGBRIDGE_CAPABILITIES)
        for category, keys in _CAPABILITY_GROUPS.items():
            if category in succeeded:
                for key in keys:
                    capabilities[key] = "supported"
            elif errors:
                for key in keys:
                    capabilities[key] = "partial"

        if errors:
            message = "连接成功，部分代表接口需要按账户权限或市场范围进一步验证"
        else:
            message = "连接成功，行情、基本面、市场、市场温度、资讯与财经日历接口均返回正常"
        return LongbridgeProbeResult(status="success", capabilities=capabilities, message=message)


class LongbridgeScreenerAdapter:
    """Fetch and normalize CN A-share screener rows."""

    _PATH = "/v1/quote/ai/screener/search"
    _DEFAULT_RETURNS = (
        "filter_prevclose",
        "filter_prevchg",
        "filter_marketcap",
        "filter_salesgrowthyoy",
        "filter_pettm",
        "filter_pbmrq",
        "filter_industry",
    )
    # Dividend yield is not part of Longbridge's default seven return columns.
    _EXTRA_RETURNS = ("filter_divyld",)
    _INDICATORS_PATH = "/v1/quote/ai/screener/indicators"

    def __init__(self, client: LongbridgeHttpClient) -> None:
        self._client = client
        self._market_cap_unit: str | None = None
        self._market_cap_unit_loaded = False

    @staticmethod
    def _read_market_cap_unit(payload: dict[str, Any]) -> str | None:
        data = payload.get("data")
        candidates: list[object] = [data, payload]
        for candidate in candidates:
            if isinstance(candidate, dict):
                groups = candidate.get("groups")
                if isinstance(groups, list):
                    for group in groups:
                        if not isinstance(group, dict):
                            continue
                        indicators = group.get("indicators")
                        if not isinstance(indicators, list):
                            continue
                        for indicator in indicators:
                            if not isinstance(indicator, dict):
                                continue
                            key = indicator.get("key")
                            if key in {"marketcap", "filter_marketcap"}:
                                unit = indicator.get("unit")
                                return unit if isinstance(unit, str) and unit.strip() else None
                indicators = candidate.get("indicators")
                if isinstance(indicators, list):
                    for indicator in indicators:
                        if not isinstance(indicator, dict):
                            continue
                        key = indicator.get("key")
                        if key in {"marketcap", "filter_marketcap"}:
                            unit = indicator.get("unit")
                            return unit if isinstance(unit, str) and unit.strip() else None
            elif isinstance(candidate, list):
                for indicator in candidate:
                    if not isinstance(indicator, dict):
                        continue
                    key = indicator.get("key")
                    if key in {"marketcap", "filter_marketcap"}:
                        unit = indicator.get("unit")
                        return unit if isinstance(unit, str) and unit.strip() else None
        return None

    async def _load_market_cap_unit(self) -> str | None:
        if self._market_cap_unit_loaded:
            return self._market_cap_unit
        self._market_cap_unit_loaded = True
        try:
            payload = await self._client.request_json("GET", self._INDICATORS_PATH)
        except LongbridgeError:
            logger.warning("Longbridge screener indicator metadata unavailable")
            return None
        self._market_cap_unit = self._read_market_cap_unit(payload)
        return self._market_cap_unit

    async def search(
        self,
        filters: dict[str, float | None],
        *,
        page: int = 0,
        size: int = 100,
    ) -> LongbridgeScreenerPage:
        has_market_cap_bound = any(
            filters.get(field) is not None
            for field in ("market_cap_min", "market_cap_max")
        )
        market_cap_unit = await self._load_market_cap_unit() if has_market_cap_bound else None
        conditions: list[dict[str, Any]] = []
        for field, key in (
            ("market_cap", "marketcap"),
            ("dividend_yield", "divyld"),
            ("pb", "pbmrq"),
            ("pe_ttm", "pettm"),
        ):
            minimum = filters.get(f"{field}_min")
            maximum = filters.get(f"{field}_max")
            if minimum is None and maximum is None:
                continue
            condition: dict[str, Any] = {
                "key": _screener_api_key(key),
                "min": "",
                "max": "",
                "tech_values": {},
            }
            if minimum is not None:
                condition["min"] = _screener_condition_bound(
                    key, minimum, market_cap_unit=market_cap_unit
                )
            if maximum is not None:
                condition["max"] = _screener_condition_bound(
                    key, maximum, market_cap_unit=market_cap_unit
                )
            conditions.append(condition)

        returns = list(self._DEFAULT_RETURNS)
        for field in [*self._EXTRA_RETURNS, *(condition["key"] for condition in conditions)]:
            if field not in returns:
                returns.append(field)

        payload = await self._client.request_json(
            "POST",
            self._PATH,
            payload={
                "market": "CN",
                "filters": conditions,
                "returns": returns,
                "page": page,
                "size": size,
            },
        )
        raw_items, total = _screener_items(payload)
        items = [
            normalized
            for raw_item in raw_items
            if (
                normalized := _normalize_screener_item(
                    raw_item, market_cap_unit=market_cap_unit
                )
            )
            is not None
        ]
        logger.info(
            "Longbridge screener page normalized",
            extra={
                "page": page,
                "raw_item_count": len(raw_items),
                "normalized_item_count": len(items),
                "upstream_total": total,
                "market_cap_unit": market_cap_unit,
            },
        )
        return LongbridgeScreenerPage(items=items, total=total, page=page, size=size)


def _longbridge_integer(value: object, field: str) -> int:
    if isinstance(value, bool):
        raise LongbridgeError(f"Longbridge 市场温度返回的 {field} 无效", code=5003)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            pass
    raise LongbridgeError(f"Longbridge 市场温度返回的 {field} 无效", code=5003)


def _longbridge_timestamp(value: object) -> datetime:
    if isinstance(value, bool):
        raise LongbridgeError("Longbridge 市场温度返回的更新时间无效", code=5003)
    try:
        timestamp = float(value) if isinstance(value, (int, float, str)) else None
    except (TypeError, ValueError):
        timestamp = None
    if timestamp is None:
        raise LongbridgeError("Longbridge 市场温度返回的更新时间无效", code=5003)
    try:
        return datetime.fromtimestamp(timestamp, tz=UTC)
    except (OverflowError, OSError, ValueError) as exc:
        raise LongbridgeError("Longbridge 市场温度返回的更新时间无效", code=5003) from exc


class LongbridgeMarketTemperatureAdapter:
    """Normalize Longbridge's current market-temperature snapshot."""

    def __init__(self, client: LongbridgeHttpClient) -> None:
        self._client = client

    async def get_current_market_temperature(
        self, market: str = "CN"
    ) -> LongbridgeMarketTemperature:
        payload = await self._client.get_json(
            "/v1/quote/market_temperature",
            params={"market": market.upper()},
        )
        data = payload.get("data")
        if not isinstance(data, dict):
            raise LongbridgeError("Longbridge 未返回有效的市场温度数据", code=5003)

        description = data.get("description")
        return LongbridgeMarketTemperature(
            temperature=_longbridge_integer(data.get("temperature"), "温度"),
            description=description if isinstance(description, str) else "",
            valuation=_longbridge_integer(data.get("valuation"), "估值指数"),
            sentiment=_longbridge_integer(data.get("sentiment"), "情绪指数"),
            updated_at=_longbridge_timestamp(data.get("updated_at")),
        )


CalendarCategory = Literal["macro", "earnings", "dividend", "split", "closed"]
_CALENDAR_MARKETS = frozenset({"US", "HK", "SH", "SZ"})


def _normalize_calendar_symbol(value: object) -> tuple[str | None, str | None]:
    """Convert Longbridge calendar symbols to Dibobo's ``ticker.MARKET`` form."""

    if not isinstance(value, str):
        return None, None
    raw = value.strip().upper()
    if not raw:
        return None, None

    if "." in raw:
        ticker, market = raw.rsplit(".", 1)
        if ticker and market in _CALENDAR_MARKETS:
            return f"{ticker}.{market}", market

    parts = [part for part in raw.split("/") if part]
    market_index = next(
        (index for index, part in enumerate(parts) if part in _CALENDAR_MARKETS),
        None,
    )
    if market_index is None or len(parts) < 2:
        return raw, None

    ticker = parts[0] if market_index == len(parts) - 1 else parts[-1]
    if not ticker:
        return raw, None
    market = parts[market_index]
    return f"{ticker}.{market}", market


class LongbridgeCalendarAdapter:
    """Small domain adapter around Longbridge's finance-calendar endpoint.

    The OpenAPI response is intentionally returned as raw event dictionaries
    here. The calendar service owns user scope, deduplication and product-level
    normalization so the provider vocabulary never leaks to the frontend.
    """

    _CATEGORY_MAP: dict[CalendarCategory, str] = {
        "macro": "macrodata",
        "earnings": "report",
        "dividend": "dividend",
        "split": "split",
        "closed": "closed",
    }

    def __init__(self, client: LongbridgeHttpClient) -> None:
        self._client = client

    async def get_calendar_events(
        self,
        category: CalendarCategory,
        start: date,
        end: date,
        markets: list[str] | None = None,
        symbols: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        provider_category = self._CATEGORY_MAP[category]
        market_values: list[str | None] = markets or [None]
        if symbols:
            symbol_markets = {
                market
                for symbol in symbols
                for _, market in [_normalize_calendar_symbol(symbol)]
                if market is not None
            }
            if symbol_markets:
                if markets:
                    market_values = [
                        market for market in market_values if market in symbol_markets
                    ]
                else:
                    market_values = sorted(symbol_markets)
                # A selected market with no symbols in the current universe can
                # be answered locally without making an upstream request.
                if not market_values:
                    return []

        async def fetch(market: str | None) -> list[dict[str, Any]]:
            events: list[dict[str, Any]] = []
            cursor = start
            seen_cursors: set[date] = set()

            # Longbridge paginates this endpoint with data.next_date. Keep the
            # end date fixed and advance the start date until the provider has
            # no more pages or the cursor leaves the requested range.
            for _ in range(32):
                if cursor in seen_cursors:
                    break
                seen_cursors.add(cursor)
                params = {
                    "types[]": provider_category,
                    "date": cursor.isoformat(),
                    "date_end": end.isoformat(),
                }
                if market:
                    params["markets[]"] = market
                payload = await self._client.get_json(
                    "/v1/quote/finance_calendar", params=params
                )
                page_events, next_date = _calendar_page(payload)
                events.extend(page_events)
                next_cursor = _parse_calendar_date(next_date)
                if next_cursor is None or next_cursor > end or next_cursor <= cursor:
                    break
                cursor = next_cursor
            return events

        # The HTTP client spaces request starts globally. Fetching the small
        # set of market partitions concurrently keeps network latency from
        # multiplying while retaining the provider rate guard.
        batches = await asyncio.gather(*(fetch(market) for market in market_values))
        events = [
            event
            for batch in batches
            for event in batch
            if (event_date := _parse_calendar_date(event.get("date"))) is not None
            and start <= event_date <= end
        ]
        if not symbols:
            return events

        wanted = {symbol.upper() for symbol in symbols}
        return [
            event
            for event in events
            if isinstance(event.get("symbol"), str)
            and event["symbol"].upper() in wanted
        ]


def _calendar_infos(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten Longbridge's date-grouped calendar response safely."""

    data = payload.get("data")
    if not isinstance(data, dict):
        return []
    groups = data.get("list")
    if not isinstance(groups, list):
        return []

    events: list[dict[str, Any]] = []
    for group in groups:
        if not isinstance(group, dict):
            continue
        group_date = group.get("date")
        infos = group.get("infos")
        if not isinstance(infos, list):
            continue
        for info in infos:
            if isinstance(info, dict):
                normalized = dict(info)
                if (
                    isinstance(group_date, str)
                    and _parse_calendar_date(normalized.get("date")) is None
                ):
                    clock = _calendar_clock(normalized.get("datetime")) or _calendar_clock(
                        normalized.get("date")
                    )
                    normalized["date"] = group_date
                    if clock:
                        normalized["datetime"] = f"{group_date} {clock}"
                # The raw HTTP API and SDK use different names for these
                # fields. Normalize both forms at the provider boundary.
                if "symbol" not in normalized and "counter_id" in normalized:
                    normalized["symbol"] = normalized["counter_id"]
                if "event_type" not in normalized and "type" in normalized:
                    normalized["event_type"] = normalized["type"]
                provider_symbol = normalized.get("symbol")
                canonical_symbol, symbol_market = _normalize_calendar_symbol(provider_symbol)
                if canonical_symbol:
                    normalized["provider_symbol"] = provider_symbol
                    normalized["symbol"] = canonical_symbol
                if symbol_market:
                    normalized["market"] = symbol_market
                events.append(normalized)
    return events


def _parse_calendar_date(value: object) -> date | None:
    if not isinstance(value, str):
        return None
    raw = value.strip().replace(".", "-")
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def _calendar_clock(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    parts = value.strip().split(":")
    if len(parts) not in {2, 3} or not all(part.isdigit() for part in parts):
        return None
    hours, minutes = int(parts[0]), int(parts[1])
    seconds = int(parts[2]) if len(parts) == 3 else 0
    if hours > 23 or minutes > 59 or seconds > 59:
        return None
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def _calendar_page(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], str | None]:
    data = payload.get("data")
    if not isinstance(data, dict):
        return [], None
    next_date = data.get("next_date")
    if not isinstance(next_date, str):
        next_date = None
    return _calendar_infos(payload), next_date


async def _oauth_request(
    base_url: str,
    path: str,
    *,
    timeout_seconds: float,
    form: dict[str, str] | None = None,
    payload: dict[str, object] | None = None,
) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(
            base_url=base_url.rstrip("/"), timeout=timeout_seconds
        ) as client:
            response = await client.post(path, data=form, json=payload)
    except httpx.TimeoutException as exc:
        raise LongbridgeError("Longbridge OAuth 响应超时，请稍后重试", code=5002) from exc
    except httpx.RequestError as exc:
        raise LongbridgeError("Longbridge OAuth 暂时无法访问，请检查节点地址", code=5003) from exc

    try:
        response_payload = response.json()
    except ValueError as exc:
        raise LongbridgeError("Longbridge OAuth 返回了无法识别的响应", code=5003) from exc
    if response.status_code >= 400:
        message, code = _safe_error_message(response.status_code, response_payload)
        raise LongbridgeError(message, code=code)
    if not isinstance(response_payload, dict):
        raise LongbridgeError("Longbridge OAuth 返回了无法识别的响应", code=5003)
    return response_payload


async def register_oauth_client(
    base_url: str,
    *,
    client_name: str,
    redirect_uri: str,
    timeout_seconds: float,
) -> OAuthClientRegistration:
    payload = await _oauth_request(
        base_url,
        "/oauth2/register",
        timeout_seconds=timeout_seconds,
        payload={
            "client_name": client_name,
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
        },
    )
    client_id = payload.get("client_id")
    client_secret = payload.get("client_secret")
    if not isinstance(client_id, str) or not client_id:
        raise LongbridgeError("Longbridge OAuth 客户端注册失败，请检查回调地址配置", code=5003)
    return OAuthClientRegistration(
        client_id=client_id,
        client_secret=client_secret if isinstance(client_secret, str) else None,
    )


async def exchange_oauth_code(
    base_url: str,
    *,
    client_id: str,
    client_secret: str | None,
    redirect_uri: str,
    code: str,
    code_verifier: str,
    timeout_seconds: float,
) -> OAuthTokenResponse:
    form = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code": code,
        "code_verifier": code_verifier,
    }
    if client_secret:
        form["client_secret"] = client_secret
    return _parse_token_response(
        await _oauth_request(base_url, "/oauth2/token", timeout_seconds=timeout_seconds, form=form)
    )


async def refresh_oauth_token(
    base_url: str,
    *,
    client_id: str,
    client_secret: str | None,
    refresh_token: str,
    timeout_seconds: float,
) -> OAuthTokenResponse:
    form = {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "refresh_token": refresh_token,
    }
    if client_secret:
        form["client_secret"] = client_secret
    return _parse_token_response(
        await _oauth_request(base_url, "/oauth2/token", timeout_seconds=timeout_seconds, form=form)
    )


def _parse_token_response(payload: dict[str, Any]) -> OAuthTokenResponse:
    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise LongbridgeError("Longbridge OAuth 未返回访问令牌", code=2001)
    raw_expires_in = payload.get("expires_in")
    expires_in = raw_expires_in if isinstance(raw_expires_in, int) else None
    refresh_token = payload.get("refresh_token")
    token_type = payload.get("token_type")
    return OAuthTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token if isinstance(refresh_token, str) else None,
        expires_in=expires_in,
        token_type=token_type if isinstance(token_type, str) else None,
    )
