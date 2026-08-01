import asyncio
import uuid

from celery import Celery
from celery.schedules import crontab
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.models import DataSource
from app.radar.sync import build_radar_snapshot, create_building_snapshot

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
)


def _radar_schedule(expression: str) -> crontab:
    parts = expression.split()
    if len(parts) != 5:
        return crontab(minute="0", hour="18", day_of_week="1-5")
    minute, hour, day_of_month, month_of_year, day_of_week = parts
    return crontab(
        minute=minute,
        hour=hour,
        day_of_month=day_of_month,
        month_of_year=month_of_year,
        day_of_week=day_of_week,
    )


celery_app.conf.beat_schedule = {
    "sync-dividend-radar": {
        "task": "dibobo.radar.queue-active-sources",
        "schedule": _radar_schedule(settings.radar_sync_schedule),
    }
}


@celery_app.task(name="dibobo.system.heartbeat")
def heartbeat() -> str:
    return "ok"


@celery_app.task(name="dibobo.radar.sync-snapshot")
def sync_radar_snapshot(snapshot_id: str) -> str:
    async def run() -> None:
        async with SessionLocal() as db:
            await build_radar_snapshot(db, uuid.UUID(snapshot_id), settings)

    asyncio.run(run())
    return snapshot_id


@celery_app.task(name="dibobo.radar.queue-active-sources")
def queue_active_radar_sources() -> int:
    async def run() -> list[str]:
        queued: list[str] = []
        async with SessionLocal() as db:
            sources = list(
                (
                    await db.scalars(
                        select(DataSource).where(
                            DataSource.is_active.is_(True),
                            DataSource.provider_type.in_({"fuyao", "fuyao_compatible"}),
                        )
                    )
                ).all()
            )
            for source in sources:
                snapshot, created = await create_building_snapshot(db, source)
                if created:
                    queued.append(str(snapshot.id))
        return queued

    snapshot_ids = asyncio.run(run())
    for snapshot_id in snapshot_ids:
        sync_radar_snapshot.delay(snapshot_id)
    return len(snapshot_ids)
