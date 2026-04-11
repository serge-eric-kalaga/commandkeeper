from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import database
from api.routers import (
    auth_router,
    commands_router,
    groups_router,
    imports_router,
    search_router,
    tags_router,
)
from api.routers.auth import ensure_default_admin
from api.settings import settings


def _parse_cors_origins(value: str) -> list[str]:
    return [origin.strip() for origin in value.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.init_db()
    db = database.SessionLocal()
    try:
        ensure_default_admin(db)
    finally:
        db.close()

    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(groups_router)
app.include_router(commands_router)
app.include_router(imports_router)
app.include_router(search_router)
app.include_router(tags_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
