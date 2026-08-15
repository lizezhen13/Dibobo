import asyncio
import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Literal
from urllib.parse import urlencode

import httpx

LONGBRIDGE_DEFAULT_BASE_URL = "https://openapi.longbridge.cn"

LONGBRIDGE_CAPABILITIES: dict[str, Literal["supported", "unsupported", "partial"]] = {
    "quote": "supported",
    "quote_realtime": "partial",
    "fundamental": "supported",
    "market": "supported",
    "content": "supported",
    "financial_calendar": "supported",
}

_CAPABILITY_GROUPS = {
    "quote": ("quote", "quote_realtime"),
    "fundamental": ("fundamental",),
    "market": ("market",),
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
class OAuthClientRegistration:
    client_id: str
    client_secret: str | None


@dataclass(frozen=True)
class OAuthTokenResponse:
    access_token: str
    refresh_token: str | None
    expires_in: int | None
    token_type: str | None


def _safe_error_message(status_code: int, payload: object) -> tuple[str, int]:
    if status_code in {401, 403}:
        return "Longbridge 鉴权失败，请重新授权或检查 API 凭证", 2001
    if status_code == 429:
        return "Longbridge 访问频率受限，请稍后再试", 4001
    if status_code >= 500:
        return "Longbridge 服务暂时不可用，请稍后再试", 5003

    raw_code: object = payload.get("code") if isinstance(payload, dict) else None
    code = raw_code if isinstance(raw_code, int) else 5003
    if code in {401, 401001, 401002, 403, 403001}:
        return "Longbridge 鉴权失败，请重新授权或检查 API 凭证", 2001
    if code in {429, 429001}:
        return "Longbridge 访问频率受限，请稍后再试", 4001
    if code in {400, 400001}:
        return "Longbridge 请求参数不符合接口要求", 3001
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
            message, code = _safe_error_message(response.status_code, response_payload)
            raise LongbridgeError(message, code=code)
        if not isinstance(response_payload, dict):
            raise LongbridgeError("Longbridge 返回了无法识别的响应", code=5003)

        code = response_payload.get("code")
        if code is not None and code != 0:
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
            ("content", "/v1/content/AAPL.US/news", None),
            (
                "financial_calendar",
                "/v1/quote/finance_calendar",
                {
                    "category": "report",
                    "start": today.isoformat(),
                    "end": (today + timedelta(days=7)).isoformat(),
                    "market": "HK",
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
            message = "连接成功，行情、基本面、市场、资讯与财经日历接口均返回正常"
        return LongbridgeProbeResult(status="success", capabilities=capabilities, message=message)


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
