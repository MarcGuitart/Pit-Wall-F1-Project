"""
Single error contract for the API.

Every non-2xx response has the body
    {"error": {"code": "<UPPER_SNAKE>", "message": "<human text>", "details": <object|null>}}
whatever raised it: AppError (the normal path), a leftover HTTPException,
request validation, or an uncaught exception.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException  # base of fastapi.HTTPException; also raised for unmatched routes
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Raise anywhere in a request; the handler turns it into the envelope."""

    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details


def error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details}}


def error_response(
    status: int, code: str, message: str, details: dict[str, Any] | None = None
) -> JSONResponse:
    return JSONResponse(status_code=status, content=error_body(code, message, details))


# Fallback codes for HTTPExceptions that carry no code of their own.
_STATUS_CODES: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    422: "VALIDATION_ERROR",
    425: "SESSION_NOT_HISTORICAL_YET",
    429: "OPENF1_RATE_LIMIT",
    500: "INTERNAL_ERROR",
    503: "OPENF1_ERROR",
}


async def _app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status, exc.code, exc.message, exc.details)


async def _http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    """Legacy HTTPException(detail=str | dict) — including Starlette's own 404/405."""
    fallback = _STATUS_CODES.get(exc.status_code, f"HTTP_{exc.status_code}")
    detail = exc.detail
    if isinstance(detail, dict):
        code = str(detail.get("code") or fallback).upper()
        message = str(detail.get("message") or fallback)
        rest = {k: v for k, v in detail.items() if k not in ("code", "message")}
        return error_response(exc.status_code, code, message, rest or None)
    return error_response(exc.status_code, fallback, str(detail))


async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    summary = "; ".join(
        f"{'.'.join(str(p) for p in e.get('loc', ()))}: {e.get('msg', '')}" for e in errors
    ) or "Invalid request."
    # exc.errors() can contain non-serialisable ctx values; keep only the stable fields
    safe = [{k: e.get(k) for k in ("loc", "msg", "type")} for e in errors]
    return error_response(422, "VALIDATION_ERROR", summary, {"errors": safe})


class ErrorEnvelopeMiddleware:
    """
    Catch anything that escapes the routers and answer with the envelope.

    This is a plain ASGI middleware added *inside* CORSMiddleware on purpose:
    an @app.exception_handler(Exception) runs in Starlette's outermost
    ServerErrorMiddleware, outside CORS, so its response reaches the browser
    without Access-Control-Allow-Origin and shows up as a network error.
    Here the 500 passes back out through CORSMiddleware like any response.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def _send(message: dict) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, _send)
        except Exception as exc:  # noqa: BLE001 — this is the last line of defence
            if response_started:
                raise
            logger.exception("Unhandled error on %s %s", scope.get("method"), scope.get("path"))
            response = error_response(
                500, "INTERNAL_ERROR", "Internal server error.",
                {"exception": type(exc).__name__},
            )
            await response(scope, receive, send)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(HTTPException, _http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_handler)  # type: ignore[arg-type]
