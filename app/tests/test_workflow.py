import asyncio
import io
from datetime import timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from google.genai import errors
from PIL import Image
from sqlalchemy import update

from app.config import ROOT, Settings
from app.main import create_app
from app.models import Case
from app.schemas import Annotation, ScanResult
from app.services import now
from app.tests.support import temporary_database


def photo(format="PNG"):
    if format == "HEIF_48MP":
        return (ROOT / "app/tests/fixtures/iphone-48mp.heic").read_bytes()
    data = io.BytesIO()
    Image.new("RGB", (80, 60), "green").save(data, format=format)
    return data.getvalue()


async def new_case(client, **data):
    response = await client.post(
        "/api/v1/cases",
        data={"source": "sample", "symptom": "Clicking in middle gears", **data},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def investigated(client):
    case = await new_case(client)
    path = f"/api/v1/cases/{case['id']}"
    assert (await client.post(path + "/scan")).status_code == 200
    response = await client.post(path + "/investigate")
    assert response.status_code == 200, response.text
    return path, response.json()


async def verified(client):
    path, case = await investigated(client)
    for step in case["steps"]:
        response = await client.put(
            path + "/verification-steps/" + step["id"], data={"completed": "true"}
        )
        assert response.status_code == 200, response.text
    response = await client.post(path + "/verify")
    assert response.status_code == 200, response.text
    return path, response.json()


async def test_lifecycle_persistence_and_idempotency(client, application, provider):
    path, case = await verified(client)
    assert case["verification"]["confidence"] == 61
    assert case["verification"]["conclusion"] == "inconclusive"
    assert case["available_stages"] == [
        "observe",
        "understand",
        "investigate",
        "verify",
        "act",
    ]
    assert (
        await client.post(path + "/tasks", json={"approved": False})
    ).status_code == 422
    responses = await asyncio.gather(
        *[client.post(path + "/tasks", json={"approved": True}) for _ in range(3)]
    )
    assert sorted(r.status_code for r in responses) == [200, 200, 201]
    task_id = responses[0].json()["task"]["id"]
    assert {r.json()["task"]["id"] for r in responses} == {task_id}
    responses = await asyncio.gather(
        *[
            client.post(
                f"/api/v1/tasks/{task_id}/resolve",
                json={"notes": "User reports noise stopped."},
            )
            for _ in range(3)
        ]
    )
    assert all(r.status_code == 200 for r in responses)
    for operation in ("scan", "investigate", "verify"):
        assert (await client.post(path + "/" + operation)).status_code == 200
        assert provider.calls[operation] == 1
    # A fresh application and connection pool retrieve durable progress.
    fresh = create_app(application.state.settings, provider)
    async with (
        fresh.router.lifespan_context(fresh),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=fresh), base_url="http://fresh"
        ) as other,
    ):
        restored = (await other.get(path)).json()
    assert restored["task"]["status"] == "resolved"
    assert restored["task"]["outcome_notes"] == "User reports noise stopped."
    assert (await new_case(client))["id"] != case["id"]
    assert (await client.get(path)).json()["task"]["status"] == "resolved"


async def test_prerequisites_and_not_found(client, provider):
    case = await new_case(client)
    path = f"/api/v1/cases/{case['id']}"
    for suffix, body in [
        ("investigate", None),
        ("verify", None),
        ("tasks", {"approved": True}),
    ]:
        assert (await client.post(path + "/" + suffix, json=body)).status_code == 409
    assert not provider.calls
    assert (await client.get(f"/api/v1/cases/{uuid4()}")).status_code == 404
    assert (await client.get("/api/v1/cases/not-a-uuid")).status_code == 422
    assert (
        await client.post("/api/v1/tasks/999999/resolve", json={})
    ).status_code == 404
    assert (
        await client.post("/api/v1/cases", data={"source": "sample", "symptom": "   "})
    ).status_code == 422


@pytest.mark.parametrize(
    "format,mime",
    [
        ("JPEG", "image/jpeg"),
        ("PNG", "image/png"),
        ("WEBP", "image/webp"),
        ("HEIF", "image/heic"),
        ("HEIF", "image/heif"),
        ("HEIF_48MP", "image/heic"),
    ],
)
async def test_upload_isolation(client, format, mime):
    response = await client.post(
        "/api/v1/cases",
        data={"source": "upload", "symptom": "Noise", "configuration": "My bike"},
        files={"image": ("photo", photo(format), mime)},
    )
    assert response.status_code == 201, response.text
    case = response.json()
    assert case["context"] == {
        "source": "user",
        "name": "Uploaded bicycle",
        "configuration": "My bike",
        "service": "",
    }
    image = await client.get(case["image_url"])
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"
    another = await new_case(client)
    assert (
        await client.get(case["image_url"].replace(case["id"], another["id"]))
    ).status_code == 404


async def test_upload_validation(client):
    base = {"source": "upload", "symptom": "Noise"}
    for data, file, status in [
        (base, None, 422),
        ({**base, "source": "sample"}, ("p.png", photo(), "image/png"), 422),
        (base, ("p.svg", b"<svg/>", "image/svg+xml"), 415),
        (base, ("p.png", b"not an image", "image/png"), 422),
        (base, ("p.png", b"a" * (10 * 1024 * 1024 + 1), "image/png"), 413),
    ]:
        response = await client.post(
            "/api/v1/cases", data=data, files={"image": file} if file else None
        )
        assert response.status_code == status, response.text

    async def oversized():
        yield b'--limit\r\nContent-Disposition: form-data; name="image"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n'
        for _ in range(12):
            yield b"a" * 1024 * 1024
        yield b"\r\n--limit--\r\n"

    response = await client.post(
        "/api/v1/cases",
        content=oversized(),
        headers={"Content-Type": "multipart/form-data; boundary=limit"},
    )
    assert response.status_code == 413, response.text


@pytest.mark.parametrize("format,mime", [("PNG", "image/png"), ("HEIF", "image/heic")])
async def test_evidence_photos_and_finalization(client, provider, format, mime):
    path, case = await investigated(client)
    assert (await client.post(path + "/verify")).status_code == 409
    assert (
        await client.put(path + "/verification-steps/missing", data={"completed": True})
    ).status_code == 404
    for step in case["steps"]:
        response = await client.put(
            path + "/verification-steps/" + step["id"],
            data={"completed": True, "observation": "Rubbing beside the cog."},
            files={"image": ("evidence", photo(format), mime)},
        )
        assert response.status_code == 200, response.text
        assert response.json()["steps"][0]["image_url"]
    assert (await client.post(path + "/verify")).status_code == 200
    assert provider.payloads[-1]["image_count"] == 3
    assert (
        provider.payloads[-1]["checks"][0]["observation"] == "Rubbing beside the cog."
    )
    response = await client.put(
        path + "/verification-steps/" + case["steps"][0]["id"],
        data={"completed": False},
    )
    assert response.status_code == 409


async def test_unrecognized_image_does_not_unlock(client, provider):
    provider.results["scan"] = ScanResult(
        recognized=False,
        equipment="Unknown object",
        component=None,
        model=None,
        confidence=10,
        summary="No bicycle component is visible.",
        annotations=[],
    )
    case = await new_case(client)
    path = f"/api/v1/cases/{case['id']}"
    response = await client.post(path + "/scan")
    assert response.json()["available_stages"] == ["observe"]
    assert (await client.post(path + "/investigate")).status_code == 409


@pytest.mark.parametrize(
    "failure,status",
    [
        (ValueError("malformed output"), 502),
        (HTTPException(503, "Set GEMINI_API_KEY"), 503),
        (errors.ClientError(429, {"error": {"message": "quota"}}), 503),
    ],
)
async def test_provider_failure_and_retry(client, provider, failure, status):
    case = await new_case(client)
    path = f"/api/v1/cases/{case['id']}"
    provider.failure = failure
    response = await client.post(path + "/scan")
    assert response.status_code == status, response.text
    persisted = (await client.get(path)).json()
    assert (
        persisted["scan"] is None
        and persisted["operation"] is None
        and persisted["last_error"]
    )
    assert (await client.post(path + "/scan")).status_code == 200
    assert provider.calls["scan"] == 2


async def test_timeout_releases_claim(client, application, provider):
    application.state.settings.ai_timeout_seconds = 0.05
    provider.release.clear()
    case = await new_case(client)
    path = f"/api/v1/cases/{case['id']}"
    assert (await client.post(path + "/scan")).status_code == 504
    provider.release.set()
    assert (await client.post(path + "/scan")).status_code == 200


async def test_depleted_credits_report_billing_and_preserve_upload(client, provider):
    response = await client.post(
        "/api/v1/cases",
        data={"source": "upload", "symptom": "Clicking while shifting."},
        files={"image": ("bicycle.png", photo(), "image/png")},
    )
    assert response.status_code == 201
    case = response.json()
    path = f"/api/v1/cases/{case['id']}"
    provider.failure = errors.ClientError(
        402, {"error": {"message": "Your prepayment credits are depleted."}}
    )
    response = await client.post(path + "/scan")
    assert response.status_code == 503
    detail = response.json()["detail"]
    assert "billing credits are depleted" in detail
    assert "Google AI Studio" in detail
    persisted = (await client.get(path)).json()
    assert persisted["last_error"] == detail
    assert persisted["scan"] is None
    assert persisted["operation"] is None
    assert (await client.get(persisted["image_url"])).status_code == 200
    # Once billing is restored the same saved image can be retried.
    assert (await client.post(path + "/scan")).status_code == 200


async def test_concurrent_analysis_and_expired_claim(client, application, provider):
    case = await new_case(client)
    path = f"/api/v1/cases/{case['id']}"
    provider.release.clear()
    first = asyncio.create_task(client.post(path + "/scan"))
    await asyncio.wait_for(provider.started.wait(), 5)
    try:
        assert (await client.get(path)).json()["operation"] == "scan"
        assert (await client.post(path + "/scan")).status_code == 409
    finally:
        provider.release.set()
    assert (await first).status_code == 200
    assert provider.calls["scan"] == 1
    case = await new_case(client)
    path = f"/api/v1/cases/{case['id']}"
    async with application.state.sessions() as db:
        await db.execute(
            update(Case)
            .where(Case.id == UUID(case["id"]))
            .values(
                operation="scan",
                claim_token=uuid4(),
                claimed_at=now() - timedelta(seconds=121),
            )
        )
        await db.commit()
    assert (await client.get(path)).json()["operation"] is None
    assert (await client.post(path + "/scan")).status_code == 200


async def test_health_openapi_cors_and_migration(client, database_url):
    for endpoint in (
        "/",
        "/health",
        "/health/ready",
        "/docs",
        "/openapi.json",
        "/api/v1/catalog",
    ):
        assert (await client.get(endpoint)).status_code == 200
    response = await client.options(
        "/api/v1/cases",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    config = Config(str(ROOT / "app/alembic.ini"))
    config.attributes["database_url"] = database_url
    await asyncio.to_thread(command.check, config)


async def test_readiness_rejects_pending_migration_and_approval_recovers(provider):
    async with temporary_database() as url:
        application = create_app(
            Settings(_env_file=None, database_url=url, gemini_api_key=""),
            provider,
        )
        config = Config(str(ROOT / "app/alembic.ini"))
        config.attributes["database_url"] = url
        async with (
            application.router.lifespan_context(application),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app=application), base_url="http://test"
            ) as client,
        ):
            path, case = await verified(client)
            await asyncio.to_thread(command.downgrade, config, "0005")
            assert (await client.get("/health")).status_code == 200
            response = await client.get("/health/ready")
            assert response.status_code == 503
            assert "migrations" in response.json()["detail"]
            assert (
                await client.post(path + "/tasks", json={"approved": True})
            ).status_code == 503

            await asyncio.to_thread(command.upgrade, config, "head")
            assert (await client.get("/health/ready")).status_code == 200
            approval = await client.post(path + "/tasks", json={"approved": True})
            assert approval.status_code == 201
            assert approval.json()["verification"] == case["verification"]
            retry = await client.post(path + "/tasks", json={"approved": True})
            assert retry.status_code == 200
            assert retry.json()["task"]["id"] == approval.json()["task"]["id"]


def test_annotation_and_recognition_validation():
    with pytest.raises(ValueError):
        Annotation(label="Invalid", box=[900, 0, 10, 100])
    with pytest.raises(ValueError):
        ScanResult(
            recognized=True,
            equipment="Bicycle",
            component=None,
            model=None,
            confidence=90,
            summary="Visible",
            annotations=[],
        )


async def test_component_descriptions_persist_and_legacy_scans_load(
    client, application, provider
):
    case = await new_case(client)
    path = f"/api/v1/cases/{case['id']}"
    description = "Guides the chain between the rear sprockets."
    provider.results["scan"].annotations[0].description = description
    scanned = await client.post(path + "/scan")
    assert scanned.status_code == 200
    assert scanned.json()["scan"]["annotations"][0]["description"] == description
    saved = (await client.get(path)).json()["scan"]
    assert saved["annotations"][0]["description"] == description

    # Stored scans made before per-component descriptions remain readable.
    del saved["annotations"][0]["description"]
    async with application.state.sessions() as db:
        await db.execute(
            update(Case).where(Case.id == UUID(case["id"])).values(scan=saved)
        )
        await db.commit()
    legacy = await client.get(path)
    assert legacy.status_code == 200
    assert legacy.json()["scan"]["annotations"][0]["description"] == ""


async def test_self_resolved_case_is_persisted_and_blocks_approval(client):
    path, case = await verified(client)
    first = await client.post(path + "/self-resolve")
    assert first.status_code == 200
    resolved_at = first.json()["self_resolved_at"]
    assert resolved_at
    assert first.json()["task"] is None
    again = await client.post(path + "/self-resolve")
    assert again.status_code == 200
    assert again.json()["self_resolved_at"] == resolved_at
    restored = (await client.get(path)).json()
    assert restored["self_resolved_at"] == resolved_at
    assert restored["task"] is None
    assert (
        await client.post(path + "/tasks", json={"approved": True})
    ).status_code == 409
    assert all(
        task["case_id"] != case["id"]
        for task in (await client.get("/api/v1/tasks")).json()
    )


async def test_self_resolved_requires_verification_and_no_existing_task(client):
    case = await new_case(client)
    assert (
        await client.post(f"/api/v1/cases/{case['id']}/self-resolve")
    ).status_code == 409
    assert (
        await client.post(f"/api/v1/cases/{uuid4()}/self-resolve")
    ).status_code == 404
    path, _ = await verified(client)
    approved = await client.post(path + "/tasks", json={"approved": True})
    assert approved.status_code == 201
    assert (await client.post(path + "/self-resolve")).status_code == 409
    restored = (await client.get(path)).json()
    assert restored["self_resolved_at"] is None
    assert restored["task"]["id"] == approved.json()["task"]["id"]


async def test_self_resolved_and_task_approval_are_mutually_exclusive(client):
    path, _ = await verified(client)
    skipped, approved = await asyncio.gather(
        client.post(path + "/self-resolve"),
        client.post(path + "/tasks", json={"approved": True}),
    )
    assert (skipped.status_code, approved.status_code) in {(200, 409), (409, 201)}
    restored = (await client.get(path)).json()
    assert bool(restored["self_resolved_at"]) != bool(restored["task"])
