"""Disposable databases; never drop or truncate the configured database."""

import asyncio
import os
from contextlib import asynccontextmanager
from uuid import uuid4

import psycopg
from alembic import command
from alembic.config import Config
from psycopg import sql
from sqlalchemy.engine import make_url

from app.config import ROOT


@asynccontextmanager
async def temporary_database():
    admin_url = make_url(
        os.getenv(
            "TEST_DATABASE_URL",
            "postgresql+psycopg://mekascope:mekascope@127.0.0.1:5433/mekascope",
        )
    )
    name = "mekascope_test_" + uuid4().hex
    admin = await psycopg.AsyncConnection.connect(
        admin_url.set(drivername="postgresql").render_as_string(hide_password=False),
        autocommit=True,
    )
    await admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    url = admin_url.set(database=name).render_as_string(hide_password=False)
    try:
        config = Config(str(ROOT / "app/alembic.ini"))
        config.attributes["database_url"] = url
        await asyncio.to_thread(command.upgrade, config, "head")
        yield url
    finally:
        await admin.execute(
            sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name))
        )
        await admin.close()
