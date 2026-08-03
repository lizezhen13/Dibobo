import asyncio
import logging
import time
import uuid

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import Settings
from app.data_sources.base import DataSourceError

logger = logging.getLogger(__name__)

SYSTEMIC_FAILURE_CODES = {4001, 5002, 5003}


class RadarUpstreamController:
    def __init__(
        self,
        cache: Redis,
        data_source_id: uuid.UUID,
        settings: Settings,
    ) -> None:
        self.cache = cache
        self.source_key = str(data_source_id)
        self.qps = settings.radar_upstream_qps
        self.failure_threshold = settings.radar_breaker_failure_threshold
        self.failure_window_seconds = settings.radar_breaker_window_seconds
        self.cooldown_seconds = settings.radar_breaker_cooldown_seconds

    def _breaker_key(self, capability: str) -> str:
        return f"radar:breaker:{self.source_key}:{capability}"

    async def before_request(self, capability: str) -> None:
        try:
            breaker = await self.cache.get(self._breaker_key(capability))
        except RedisError:
            return
        if breaker is not None:
            raise DataSourceError(
                5003,
                f"数据源 {capability} 能力暂时不可用，已暂停重复请求",
            )

        while True:
            current = time.time()
            bucket = int(current)
            rate_key = f"radar:rate:{self.source_key}:{bucket}"
            try:
                count = await self.cache.incr(rate_key)
                if count == 1:
                    await self.cache.expire(rate_key, 2)
            except RedisError:
                return
            if count <= self.qps:
                return
            await asyncio.sleep(max(0.01, 1 - (current - bucket)))

    async def record_success(self, capability: str) -> None:
        return None

    async def record_failure(self, capability: str, code: int) -> None:
        if code not in SYSTEMIC_FAILURE_CODES:
            return
        failures_key = f"radar:failures:{self.source_key}:{capability}"
        try:
            failures = await self.cache.incr(failures_key)
            if failures == 1:
                await self.cache.expire(failures_key, self.failure_window_seconds)
            if failures < self.failure_threshold:
                return
            await self.cache.set(
                self._breaker_key(capability),
                str(code),
                ex=self.cooldown_seconds,
            )
            logger.warning(
                "Radar upstream circuit opened",
                extra={
                    "data_source_id": self.source_key,
                    "capability": capability,
                    "error_code": code,
                    "cooldown_seconds": self.cooldown_seconds,
                },
            )
        except RedisError:
            return
