import asyncio
import logging
import uuid
from typing import Any

from celery import Celery, signals
from redis import Redis as SyncRedis
from redis.asyncio import Redis as AsyncRedis
from redis.exceptions import LockError, RedisError

from app.core.config import get_settings
from app.core.database import SessionLocal, engine
from app.radar.search import execute_radar_search
from app.radar.service import (
    mark_search_failed,
    mark_search_waiting,
    recover_stale_search_jobs,
)
from app.radar.upstream_control import RadarUpstreamController

logger = logging.getLogger(__name__)
settings = get_settings()
celery_app = Celery(
    "dibobo",
    broker=settings.valkey_url,
    backend=settings.valkey_url,
)
celery_app.conf.update(
    timezone=settings.timezone,
    enable_utc=True,
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    broker_connection_retry_on_startup=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

_worker_loop: asyncio.AbstractEventLoop | None = None


def _get_worker_loop() -> asyncio.AbstractEventLoop:
    global _worker_loop
    if _worker_loop is None or _worker_loop.is_closed():
        _worker_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_worker_loop)
    return _worker_loop


async def _recover_interrupted_jobs() -> None:
    async with SessionLocal() as db:
        recovered = await recover_stale_search_jobs(db, settings)
    if recovered:
        logger.warning("Recovered interrupted radar jobs", extra={"job_count": recovered})


@signals.worker_process_init.connect
def initialize_worker_process(**_kwargs: object) -> None:
    loop = _get_worker_loop()
    try:
        loop.run_until_complete(_recover_interrupted_jobs())
    except Exception:
        logger.exception("Failed to recover interrupted radar jobs during worker startup")


@signals.worker_process_shutdown.connect
def shutdown_worker_process(**_kwargs: object) -> None:
    global _worker_loop
    if _worker_loop is None or _worker_loop.is_closed():
        return
    try:
        _worker_loop.run_until_complete(engine.dispose())
    finally:
        _worker_loop.close()
        _worker_loop = None


@celery_app.task(name="dibobo.system.heartbeat")
def heartbeat() -> str:
    return "ok"


async def _execute_search(search_id: uuid.UUID, data_source_id: uuid.UUID) -> None:
    cache = AsyncRedis.from_url(settings.valkey_url, decode_responses=True)
    try:
        control = RadarUpstreamController(cache, data_source_id, settings)
        async with SessionLocal() as db:
            await execute_radar_search(db, search_id, settings, control)
    finally:
        await cache.aclose()


async def _fail_search(search_id: uuid.UUID, message: str) -> None:
    async with SessionLocal() as db:
        await mark_search_failed(db, search_id, message)


async def _mark_search_waiting(search_id: uuid.UUID) -> None:
    async with SessionLocal() as db:
        await mark_search_waiting(db, search_id)


@celery_app.task(bind=True, name="dibobo.radar.run-search")
def run_radar_search(self: Any, search_id: str, data_source_id: str) -> str:
    parsed_search_id = uuid.UUID(search_id)
    parsed_source_id = uuid.UUID(data_source_id)
    loop = _get_worker_loop()
    loop.run_until_complete(_mark_search_waiting(parsed_search_id))
    sync_cache = SyncRedis.from_url(settings.valkey_url, decode_responses=True)
    lock = sync_cache.lock(
        f"radar:source-lock:{data_source_id}",
        timeout=settings.radar_source_lock_seconds,
        blocking=False,
    )
    acquired = False
    try:
        acquired = bool(lock.acquire(blocking=False))
    except RedisError:
        logger.exception("Radar source lock is unavailable; continuing with local worker control")
        acquired = True

    if not acquired:
        sync_cache.close()
        max_retries = max(
            1,
            settings.radar_source_lock_seconds // settings.radar_source_lock_retry_seconds,
        )
        if self.request.retries >= max_retries:
            loop.run_until_complete(
                _fail_search(parsed_search_id, "同一数据源检索任务等待超时，请重新搜索")
            )
            return search_id
        raise self.retry(
            countdown=settings.radar_source_lock_retry_seconds,
            max_retries=max_retries,
        )

    try:
        loop.run_until_complete(_execute_search(parsed_search_id, parsed_source_id))
    except Exception:
        logger.exception("Radar worker task failed", extra={"search_id": search_id})
        try:
            loop.run_until_complete(
                _fail_search(parsed_search_id, "后台检索任务异常退出，请重新搜索")
            )
        except Exception:
            logger.exception(
                "Failed to mark radar search as failed",
                extra={"search_id": search_id},
            )
        raise
    finally:
        if acquired:
            try:
                lock.release()
            except (LockError, RedisError):
                logger.warning("Radar source lock expired before release")
        sync_cache.close()
    return search_id
