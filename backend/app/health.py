from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import text

from app.core.database import SessionLocal

router = APIRouter(prefix="/health", tags=["健康检查"])


@router.get("/live", include_in_schema=False)
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", include_in_schema=False)
async def ready(request: Request) -> dict[str, str]:
    try:
        async with SessionLocal() as db:
            await db.execute(text("SELECT 1"))
        await request.app.state.cache.ping()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="服务依赖尚未就绪",
        ) from exc
    return {"status": "ready"}

