from celery import Celery

from app.core.config import get_settings

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


@celery_app.task(name="dibobo.system.heartbeat")
def heartbeat() -> str:
    return "ok"

