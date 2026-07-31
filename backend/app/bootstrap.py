import logging

from sqlalchemy import select

from app.core.config import Settings
from app.core.database import SessionLocal
from app.core.models import User
from app.core.security import hash_password

logger = logging.getLogger(__name__)


async def bootstrap_initial_user(settings: Settings) -> None:
    if settings.initial_username is None or settings.initial_password is None:
        return

    username = settings.initial_username.strip()
    password = settings.initial_password.get_secret_value()
    async with SessionLocal() as db:
        existing = await db.scalar(select(User).where(User.username == username))
        if existing is not None:
            logger.info("Initial user already exists", extra={"user_id": str(existing.id)})
            return

        user = User(username=username, password_hash=hash_password(password))
        db.add(user)
        await db.commit()
        logger.info("Initial user created", extra={"user_id": str(user.id)})

