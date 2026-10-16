"""Only launched explicitly by Playwright; uses a disposable migrated database."""

import os
from contextlib import asynccontextmanager

from fastapi import HTTPException

from app.config import Settings
from app.main import create_app
from app.tests.fakes import FakeProvider
from app.tests.support import temporary_database

if os.getenv("MEKASCOPE_E2E") != "1":
    raise RuntimeError("The test server requires MEKASCOPE_E2E=1.")

settings = Settings(_env_file=None, gemini_api_key="")
provider = FakeProvider()
app = create_app(settings, provider)
original_lifespan = app.router.lifespan_context


@asynccontextmanager
async def lifespan(application):
    async with temporary_database() as url:
        settings.database_url = url
        async with original_lifespan(application):
            yield


app.router.lifespan_context = lifespan


@app.post("/__test/fail-next")
async def fail_next() -> dict:
    provider.failure = HTTPException(
        503, "Test provider temporarily unavailable. Retry analysis."
    )
    return {"ok": True}


@app.post("/__test/pause")
async def pause() -> dict:
    provider.release.clear()
    return {"ok": True}


@app.post("/__test/release")
async def release() -> dict:
    provider.release.set()
    return {"ok": True}
