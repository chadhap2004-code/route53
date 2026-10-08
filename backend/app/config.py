"""Runtime configuration from environment variables (12-factor style)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    database_path: str = field(default_factory=lambda: os.getenv("DATABASE_PATH", "./data/route53.db"))
    # Comma-separated list of allowed browser origins (only needed if the frontend calls the API directly).
    cors_origins: list[str] = field(
        default_factory=lambda: [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
    )
    session_cookie_name: str = "r53_session"
    session_ttl_hours: int = field(default_factory=lambda: int(os.getenv("SESSION_TTL_HOURS", "12")))
    cookie_secure: bool = field(default_factory=lambda: _bool("COOKIE_SECURE", False))
    seed_demo_data: bool = field(default_factory=lambda: _bool("SEED_DEMO_DATA", True))
    demo_username: str = field(default_factory=lambda: os.getenv("DEMO_USERNAME", "demo"))
    demo_password: str = field(default_factory=lambda: os.getenv("DEMO_PASSWORD", "route53-demo"))


settings = Settings()
