from __future__ import annotations

import asyncio
import logging
from typing import Callable
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.services.share_service import cleanup_expired_permissions

logger = logging.getLogger("medivault.maintenance")


class PermissionExpirationWorker:
    """Background maintenance mechanism appropriate for FastAPI to identify expired permissions.

    CRITICAL SECURITY INVARIANT:
    Never rely solely on this background job for security.
    The authorization check independently verifies expiration on every access request.
    This background task acts as an automated housekeeping worker to keep database status
    and token tables consistent over time.
    """

    def __init__(
        self,
        interval_seconds: int = 60,
        session_factory: Callable[[], Session] = SessionLocal,
    ) -> None:
        self.interval_seconds = interval_seconds
        self.session_factory = session_factory
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        """Start the background maintenance worker loop."""
        if self._task and not self._task.done():
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_loop())
        logger.info(
            "PermissionExpirationWorker started. Interval: %d seconds.",
            self.interval_seconds,
        )

    async def stop(self) -> None:
        """Stop and cancel the background worker loop gracefully."""
        self._stop_event.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("PermissionExpirationWorker stopped.")

    async def run_once(self) -> dict:
        """Execute a single maintenance cleanup pass synchronously in a session."""
        with self.session_factory() as db:
            return cleanup_expired_permissions(db)

    async def _run_loop(self) -> None:
        """Main periodic loop."""
        while not self._stop_event.is_set():
            try:
                with self.session_factory() as db:
                    result = cleanup_expired_permissions(db)
                    if result["expired_count"] > 0:
                        logger.info(
                            "Background cleanup worker transitioned %d permissions to EXPIRED. IDs: %s",
                            result["expired_count"],
                            result["expired_permission_ids"],
                        )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in background permission cleanup task: %s", e, exc_info=True)

            try:
                # Wait for the next interval or until stop_event is flagged
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=float(self.interval_seconds)
                )
                break
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
