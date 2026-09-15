import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import ErrorEnvelopeMiddleware, install_error_handlers
from app.api.races import router as races_router
from app.api.analysis import router as analysis_router
from app.api.admin import router as admin_router
from app.api.chat import router as chat_router
from app.api.telemetry import router as telemetry_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Pit Wall IQ",
    description="F1 race strategy intelligence API",
    version="2.0.0",
)

# Order matters: middlewares added later wrap the ones added earlier, so the
# error envelope sits inside CORS and its 500s carry CORS headers.
app.add_middleware(ErrorEnvelopeMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

install_error_handlers(app)

app.include_router(races_router)
app.include_router(analysis_router)
app.include_router(admin_router)
app.include_router(chat_router)
app.include_router(telemetry_router)


@app.on_event("startup")
async def _startup_log() -> None:
    paths = [r.path for r in app.routes]  # type: ignore[attr-defined]
    logger.info("[STARTUP] environment=%s cache_path=%s", settings.environment, settings.cache_path.resolve())
    logger.info("[STARTUP] routes registered: %s", paths)


@app.api_route("/health", methods=["GET", "HEAD"])
async def health() -> dict:
    return {"status": "ok"}
