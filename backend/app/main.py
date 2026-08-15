import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from redis.asyncio import Redis

from app.auth.router import router as auth_router
from app.bootstrap import bootstrap_initial_user
from app.calendar.router import router as calendar_router
from app.core.config import get_settings
from app.core.security import ApiKeyCipher
from app.global_market.router import router as global_market_router
from app.global_market.service import run_global_market_scheduler
from app.health import router as health_router
from app.holdings.router import router as holdings_router
from app.journals.router import router as journals_router
from app.overview.router import router as overview_router
from app.portfolios.router import router as portfolios_router
from app.settings.router import router as settings_router
from app.watchlist.router import router as watchlist_router

settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    app.state.cache = Redis.from_url(settings.valkey_url, decode_responses=True)
    await bootstrap_initial_user(settings)
    app.state.global_market_refresh_task = None
    if settings.akshare_enabled and settings.global_market_enabled:
        app.state.global_market_refresh_task = asyncio.create_task(
            run_global_market_scheduler(app.state.cache, settings),
            name="dibobo-global-market-refresh",
        )
    yield
    refresh_task = app.state.global_market_refresh_task
    if refresh_task is not None:
        refresh_task.cancel()
        await asyncio.gather(refresh_task, return_exceptions=True)
    await app.state.cache.aclose()


app = FastAPI(
    title="Dibobo API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(calendar_router, prefix="/api")
app.include_router(overview_router, prefix="/api")
app.include_router(global_market_router, prefix="/api")
app.include_router(portfolios_router, prefix="/api")
app.include_router(holdings_router, prefix="/api")
app.include_router(journals_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(watchlist_router, prefix="/api")
