import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.races import router as races_router
from app.api.analysis import router as analysis_router
from app.api.admin import router as admin_router

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Pit Wall IQ",
    description="F1 race strategy intelligence API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(races_router)
app.include_router(analysis_router)
app.include_router(admin_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
