"""AWS-style API errors.

Route53 returns errors as {Code, Message}; we mirror that shape so the frontend can show
the same messages the real console shows (e.g. HostedZoneNotEmpty).
"""
from __future__ import annotations

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import settings


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: list[str] | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


def not_found(code: str, message: str) -> ApiError:
    return ApiError(404, code, message)


def invalid_change_batch(messages: list[str]) -> ApiError:
    # Route53 joins multiple validation problems into one InvalidChangeBatch error.
    return ApiError(400, "InvalidChangeBatch", "; ".join(messages), messages)


async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    response = JSONResponse(
        status_code=exc.status,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )
    if exc.code == "NotAuthenticated":
        # Clear a stale or expired session cookie, so the frontend middleware (which only sees whether
        # a cookie exists) doesn't keep treating the browser as signed in.
        response.delete_cookie(settings.session_cookie_name, path="/")
    return response


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    details = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", []) if p != "body")
        details.append(f"{loc}: {err.get('msg')}" if loc else str(err.get("msg")))
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "InvalidInput", "message": "; ".join(details), "details": details}},
    )
