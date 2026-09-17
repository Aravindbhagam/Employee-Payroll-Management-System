from datetime import datetime, timedelta


def now_utc():
    """Naive UTC datetime, matching how psycopg2 reads back the schema's
    timezone-less TIMESTAMP columns (comparing against an aware datetime
    would raise)."""
    return datetime.utcnow()


def future(**kwargs):
    return now_utc() + timedelta(**kwargs)


def iso_now():
    """ISO-8601 with millisecond precision and a trailing Z, matching
    JavaScript's `new Date().toISOString()` exactly (the check_in/check_out
    columns are TEXT, storing this exact string format)."""
    return now_utc().isoformat(timespec="milliseconds") + "Z"


def start_of_day(dt=None):
    dt = dt or now_utc()
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)
