import httpx
import pytest
import pytest_asyncio

from app.config import Settings
from app.main import create_app
from app.tests.fakes import FakeProvider
from app.tests.support import temporary_database


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def database_url():
    async with temporary_database() as url:
        yield url


@pytest.fixture
def provider():
    return FakeProvider()


@pytest_asyncio.fixture
async def application(database_url, provider):
    app = create_app(
        Settings(_env_file=None, database_url=database_url, gemini_api_key=""), provider
    )
    async with app.router.lifespan_context(app):
        yield app


@pytest_asyncio.fixture
async def client(application):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application), base_url="http://test"
    ) as client:
        yield client
