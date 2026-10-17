"""Default equipment and history survive restarts and fresh database setup."""

import asyncio
from datetime import date
from uuid import UUID, uuid4

import httpx
from alembic import command
from alembic.config import Config
from sqlalchemy import delete, select

from app.config import ROOT, Settings
from app.database import create_database
from app.main import create_app
from app.models import Equipment, ServiceRecord
from app.tests.fakes import FakeProvider
from app.tests.support import temporary_database

SEED_ID = UUID("8a31da2e-d0a5-45ec-8be0-3cfaf67263f7")
SERVICE_ID = UUID("f7c4f9e0-15cc-49c8-90e5-84ea1c2c6ac7")
EXPECTED = {
    "name": "Road bike",
    "manufacturer": "Element",
    "model": "FRC 50 CRD",
    "serial_number": "2026/07/07-ELE-CRD",
    "configuration": (
        "Road bicycle; 2x10-speed drivetrain; Sensah Phi front and rear derailleur; "
        "Luce Alloy 170mm 50-34T; 11–28T cassette; Hydraulic Disc Brake Rotor 160mm."
    ),
}
EXPECTED_SERVICE = {
    "title": "RD adjuster",
    "performed_on": "2026-08-17",
    "service_type": "maintenance",
    "performed_by": "Bike Technician",
    "notes": "Adjust the RD for better gear shifting.",
}


def migration_config(url):
    config = Config(str(ROOT / "app/alembic.ini"))
    config.attributes["database_url"] = url
    return config


async def test_default_equipment_and_service_are_available_through_api(client):
    response = await client.get("/api/v1/equipment")
    assert response.status_code == 200
    seeded = [item for item in response.json() if item["id"] == str(SEED_ID)]
    assert len(seeded) == 1
    assert {key: seeded[0][key] for key in EXPECTED} == EXPECTED
    response = await client.get(
        "/api/v1/service-records", params={"equipment_id": str(SEED_ID)}
    )
    assert response.status_code == 200
    seeded_service = [item for item in response.json() if item["id"] == str(SERVICE_ID)]
    assert len(seeded_service) == 1
    assert seeded_service[0]["equipment_id"] == str(SEED_ID)
    assert {key: seeded_service[0][key] for key in EXPECTED_SERVICE} == EXPECTED_SERVICE


async def test_fresh_databases_and_application_restarts_seed_once():
    # Independent disposable databases exercise a full reset without touching
    # the developer's database or Docker volume.
    for _ in range(2):
        async with temporary_database() as url:
            settings = Settings(_env_file=None, database_url=url, gemini_api_key="")
            config = migration_config(url)
            original = None
            original_service = None
            for _ in range(2):
                # Docker runs the same upgrade command on every backend startup.
                await asyncio.to_thread(command.upgrade, config, "head")
                application = create_app(settings, FakeProvider())
                async with (
                    application.router.lifespan_context(application),
                    httpx.AsyncClient(
                        transport=httpx.ASGITransport(app=application),
                        base_url="http://test",
                    ) as client,
                ):
                    records = (await client.get("/api/v1/equipment")).json()
                    assert len(records) == 1
                    assert records[0]["id"] == str(SEED_ID)
                    assert {key: records[0][key] for key in EXPECTED} == EXPECTED
                    history = (await client.get("/api/v1/service-records")).json()
                    assert len(history) == 1
                    assert history[0]["id"] == str(SERVICE_ID)
                    assert history[0]["equipment_id"] == str(SEED_ID)
                    assert {
                        key: history[0][key] for key in EXPECTED_SERVICE
                    } == EXPECTED_SERVICE
                    if original is None:
                        original = records[0]
                        original_service = history[0]
                    else:
                        assert records[0] == original
                        assert history[0] == original_service


async def test_seed_reuses_existing_asset_and_preserves_edits_and_history():
    async with temporary_database() as url:
        config = migration_config(url)
        await asyncio.to_thread(command.downgrade, config, "0003")
        engine, sessions = create_database(Settings(_env_file=None, database_url=url))
        try:
            existing_id = uuid4()
            service_id = uuid4()
            async with sessions.begin() as db:
                # Replace only the default row in this disposable database to
                # simulate a matching asset saved before the seed migration.
                await db.execute(
                    delete(ServiceRecord).where(ServiceRecord.id == SERVICE_ID)
                )
                await db.execute(delete(Equipment).where(Equipment.id == SEED_ID))
                db.add(
                    Equipment(
                        id=existing_id,
                        **{
                            **EXPECTED,
                            "configuration": "Owner's updated configuration.",
                        },
                    )
                )
                await db.flush()
                db.add(
                    ServiceRecord(
                        id=service_id,
                        equipment_id=existing_id,
                        title="Drivetrain checked",
                        performed_on=date(2026, 10, 1),
                        service_type="inspection",
                        notes="Shifting checked under load.",
                    )
                )
            for _ in range(2):
                await asyncio.to_thread(command.upgrade, config, "head")
                await asyncio.to_thread(command.downgrade, config, "0003")
            await asyncio.to_thread(command.upgrade, config, "head")
            async with sessions() as db:
                records = (await db.scalars(select(Equipment))).all()
                assert len(records) == 1
                assert records[0].id == existing_id
                assert records[0].configuration == "Owner's updated configuration."
                service = await db.get(ServiceRecord, service_id)
                assert service.equipment_id == existing_id
                assert service.notes == "Shifting checked under load."
                seeded_service = await db.get(ServiceRecord, SERVICE_ID)
                assert seeded_service.equipment_id == existing_id
                assert seeded_service.title == EXPECTED_SERVICE["title"]
                assert seeded_service.performed_on == date(2026, 8, 17)
                assert seeded_service.notes == EXPECTED_SERVICE["notes"]
        finally:
            await engine.dispose()


async def test_service_seed_reuses_matching_record_and_preserves_edits():
    async with temporary_database() as url:
        config = migration_config(url)
        await asyncio.to_thread(command.downgrade, config, "0004")
        engine, sessions = create_database(Settings(_env_file=None, database_url=url))
        try:
            existing_id = uuid4()
            async with sessions.begin() as db:
                await db.execute(
                    delete(ServiceRecord).where(ServiceRecord.id == SERVICE_ID)
                )
                db.add(
                    ServiceRecord(
                        id=existing_id,
                        equipment_id=SEED_ID,
                        **{
                            **EXPECTED_SERVICE,
                            "performed_on": date(2026, 8, 17),
                            "notes": "Owner's updated service observations.",
                        },
                    )
                )
            for _ in range(2):
                await asyncio.to_thread(command.upgrade, config, "head")
                await asyncio.to_thread(command.downgrade, config, "0004")
            await asyncio.to_thread(command.upgrade, config, "head")
            async with sessions() as db:
                history = (await db.scalars(select(ServiceRecord))).all()
                assert len(history) == 1
                assert history[0].id == existing_id
                assert history[0].equipment_id == SEED_ID
                assert history[0].notes == "Owner's updated service observations."
        finally:
            await engine.dispose()
