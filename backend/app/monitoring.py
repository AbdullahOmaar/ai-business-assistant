"""Optional Sentry error monitoring for the API.

Monitoring stays fully off unless the operator sets ``SENTRY_DSN``; the
application must boot identically without it (local development, tests and
preview environments carry no DSN). When enabled, events carry no personal
data by default: ``send_default_pii`` is explicitly ``False``, so Sentry does
not attach request headers, cookies, bodies or user identity, and tracing is
disabled (``traces_sample_rate`` 0) — this is error reporting only.
"""

import os


def configure_sentry() -> bool:
    """Initialize Sentry when ``SENTRY_DSN`` is configured.

    Returns ``True`` when monitoring was enabled, ``False`` when it stayed
    off. The environment label reuses the platform's existing ``VERCEL_ENV``
    signal (``production``/``preview``/``development``), falling back to
    ``local`` outside Vercel.
    """
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("VERCEL_ENV", "").strip() or "local",
        send_default_pii=False,
        traces_sample_rate=0.0,
    )
    return True
