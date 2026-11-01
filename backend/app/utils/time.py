"""Time helpers. All timestamps are stored as naive UTC datetimes."""
from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
