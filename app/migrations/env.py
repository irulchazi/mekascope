"""Run migrations with the same async driver as the application."""

import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import Settings
from app.models import Base

config = context.config
url = config.attributes.get("database_url") or Settings().database_url


def migrate(connection) -> None:
    context.configure(
        connection=connection, target_metadata=Base.metadata, compare_type=True
    )
    with context.begin_transaction():
        context.run_migrations()


async def online() -> None:
    engine = create_async_engine(url)
    async with engine.connect() as connection:
        await connection.run_sync(migrate)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(online())
