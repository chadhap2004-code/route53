"""FastAPI application entry point.

Run locally:  uvicorn app.main:app --reload --port 8000
API docs:     http://localhost:8000/docs
"""
from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import connect, get_db, init_schema
from .deps import CurrentUser, current_user
from .errors import ApiError, api_error_handler, validation_error_handler
from .routers import auth, zones
from .seed import reset_account, seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    conn = connect()
    try:
        init_schema(conn)
        if settings.seed_demo_data:
            seed(conn)
    finally:
        conn.close()
    yield


app = FastAPI(
    title="Route 53 Clone API",
    version="1.0.0",
    description="Hosted zones and DNS record management with Route 53 semantics, backed by SQLite.",
    lifespan=lifespan,
)

# In production the browser talks to Next.js, which proxies /api/* here (same origin, no CORS needed).
# CORS stays configured for running the frontend against the API directly during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)

app.include_router(auth.router)
app.include_router(zones.router)


@app.get("/api/health", tags=["meta"])
def health(db: sqlite3.Connection = Depends(get_db)):
    db.execute("SELECT 1").fetchone()
    return {"status": "ok"}


@app.post("/api/demo/reset", status_code=204, tags=["meta"])
def demo_reset(user: CurrentUser = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Restore the signed-in account's demo data (handy when several reviewers share the demo)."""
    reset_account(db, user.account_id, user.username)
