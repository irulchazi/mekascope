"""FastAPI entry point and resource lifecycle."""

from contextlib import asynccontextmanager

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.ai import DiagnosisProvider, GeminiProvider
from app.config import ROOT, Settings
from app.database import create_database
from app.routers import router


class BodyLimitMiddleware:
    """Bound streaming multipart bodies, including those without Content-Length."""

    def __init__(self, app: ASGIApp, limit: int) -> None:
        self.app, self.limit = app, limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        try:
            length = int(dict(scope["headers"]).get(b"content-length", b"0"))
        except ValueError:
            await JSONResponse({"detail": "Invalid Content-Length."}, 400)(
                scope, receive, send
            )
            return
        if length > self.limit:
            await JSONResponse(
                {"detail": "Request exceeds the image upload limit."}, 413
            )(scope, receive, send)
            return
        received = 0

        async def bounded_receive() -> dict:
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > self.limit:
                raise HTTPException(413, "Request exceeds the image upload limit.")
            return message

        await self.app(scope, bounded_receive, send)


def create_app(
    settings: Settings | None = None, provider: DiagnosisProvider | None = None
) -> FastAPI:
    settings = settings or Settings()
    migration_heads = set(
        ScriptDirectory.from_config(Config(str(ROOT / "app/alembic.ini"))).get_heads()
    )

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        engine, sessions = create_database(settings)
        application.state.engine, application.state.sessions = engine, sessions
        application.state.provider = provider or GeminiProvider(settings)
        try:
            yield
        finally:
            await application.state.provider.close()
            await engine.dispose()

    application = FastAPI(
        title="MekaScope API",
        description="Human-reviewed bicycle diagnosis with Gemini.",
        version="0.2.0",
        lifespan=lifespan,
    )
    application.state.settings = settings
    application.add_middleware(
        BodyLimitMiddleware, limit=settings.max_image_bytes + 64 * 1024
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type"],
    )
    application.include_router(router)

    @application.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        return JSONResponse(
            {
                "detail": "Database unavailable. Check PostgreSQL and run the migrations, then retry."
            },
            503,
        )

    @application.get("/", tags=["service"])
    async def read_root() -> dict[str, str]:
        return {"name": application.title, "version": application.version}

    @application.get("/health", tags=["service"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/health/ready", tags=["service"])
    async def readiness() -> dict[str, str]:
        async with application.state.engine.connect() as connection:
            revisions = set(
                (
                    await connection.execute(
                        text("SELECT version_num FROM alembic_version")
                    )
                ).scalars()
            )
        if revisions != migration_heads:
            raise HTTPException(
                503,
                "Database migrations are pending. Run "
                "'uv run --project app --locked python -m alembic "
                "-c app/alembic.ini upgrade head', then retry.",
            )
        return {"status": "ok"}

    return application


app = create_app()
