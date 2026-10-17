"""Equipment and service records persist and become immutable case context."""

from uuid import uuid4

from app.tests.test_workflow import photo


async def create_equipment(client, **updates):
    body = {
        "name": "Workshop road bike",
        "manufacturer": "Element",
        "model": "FRC 50",
        "serial_number": "BIKE-001",
        "configuration": "Shimano 105; 11-speed drivetrain.",
        **updates,
    }
    response = await client.post("/api/v1/equipment", json=body)
    assert response.status_code == 201, response.text
    return response.json(), body


async def create_service(client, equipment_id, **updates):
    body = {
        "equipment_id": equipment_id,
        "title": "Chain replacement",
        "performed_on": "2026-10-01",
        "service_type": "maintenance",
        "performed_by": "Workshop technician",
        "notes": "Replaced chain and checked shifting under load.",
        **updates,
    }
    response = await client.post("/api/v1/service-records", json=body)
    assert response.status_code == 201, response.text
    return response.json(), body


async def test_equipment_and_service_create_edit_and_filter(client):
    equipment, body = await create_equipment(client)
    other, _ = await create_equipment(client, name="Other bicycle")
    assert equipment["created_at"] and equipment["updated_at"]
    response = await client.put(
        f"/api/v1/equipment/{equipment['id']}",
        json={**body, "configuration": "New cassette fitted."},
    )
    assert response.status_code == 200
    listed = (await client.get("/api/v1/equipment")).json()
    assert (
        next(item for item in listed if item["id"] == equipment["id"])["configuration"]
        == "New cassette fitted."
    )
    older, _ = await create_service(client, equipment["id"])
    newer, body = await create_service(
        client, equipment["id"], title="Indexing", performed_on="2026-10-15"
    )
    await create_service(client, other["id"])
    filtered = (
        await client.get(
            "/api/v1/service-records", params={"equipment_id": equipment["id"]}
        )
    ).json()
    assert [item["id"] for item in filtered] == [newer["id"], older["id"]]
    response = await client.put(
        f"/api/v1/service-records/{newer['id']}",
        json={
            **body,
            "equipment_id": other["id"],
            "notes": "Corrected equipment link.",
        },
    )
    assert response.status_code == 200
    assert response.json()["notes"] == "Corrected equipment link."
    filtered = (
        await client.get(
            "/api/v1/service-records", params={"equipment_id": equipment["id"]}
        )
    ).json()
    assert [item["id"] for item in filtered] == [older["id"]]


async def test_record_validation_and_missing_references(client):
    for body in (
        {"name": "  "},
        {"name": "x" * 201},
        {"name": "Bike", "configuration": "x" * 4001},
    ):
        assert (await client.post("/api/v1/equipment", json=body)).status_code == 422
    equipment, equipment_body = await create_equipment(client)
    _, body = await create_service(client, equipment["id"])
    for updates in (
        {"title": " "},
        {"notes": " "},
        {"notes": "x" * 4001},
        {"performed_on": "not-a-date"},
        {"service_type": "unknown"},
    ):
        assert (
            await client.post("/api/v1/service-records", json={**body, **updates})
        ).status_code == 422
    assert (
        await client.post(
            "/api/v1/service-records", json={**body, "equipment_id": str(uuid4())}
        )
    ).status_code == 404
    assert (
        await client.put(f"/api/v1/equipment/{uuid4()}", json=equipment_body)
    ).status_code == 404
    assert (
        await client.put(f"/api/v1/service-records/{uuid4()}", json=body)
    ).status_code == 404


async def test_inspection_snapshots_selected_configuration_and_history(client):
    equipment, equipment_body = await create_equipment(client)
    record, service_body = await create_service(client, equipment["id"])
    other, _ = await create_equipment(client, name="Unrelated bicycle")
    await create_service(client, other["id"], notes="Unrelated brake replacement.")
    response = await client.post(
        "/api/v1/cases",
        data={
            "source": "upload",
            "symptom": "Clicking",
            "equipment_id": equipment["id"],
        },
        files={"image": ("bike.png", photo(), "image/png")},
    )
    assert response.status_code == 201, response.text
    case = response.json()
    assert case["context"]["name"] == equipment["name"]
    assert case["context"]["model"] == equipment["model"]
    assert case["context"]["equipment_id"] == equipment["id"]
    assert "11-speed drivetrain" in case["context"]["configuration"]
    assert "2026-10-01 — Chain replacement" in case["context"]["service"]
    assert "Unrelated brake" not in case["context"]["service"]
    await client.put(
        f"/api/v1/equipment/{equipment['id']}",
        json={**equipment_body, "configuration": "Changed later"},
    )
    await client.put(
        f"/api/v1/service-records/{record['id']}",
        json={**service_body, "notes": "Changed later"},
    )
    restored = (await client.get(f"/api/v1/cases/{case['id']}")).json()
    assert restored["context"] == case["context"]
    assert (
        await client.post(
            "/api/v1/cases",
            data={
                "source": "sample",
                "symptom": "Clicking",
                "equipment_id": equipment["id"],
            },
        )
    ).status_code == 422
    assert (
        await client.post(
            "/api/v1/cases",
            data={
                "source": "upload",
                "symptom": "Clicking",
                "equipment_id": str(uuid4()),
            },
            files={"image": ("bike.png", photo(), "image/png")},
        )
    ).status_code == 404


async def test_inspection_bounds_large_saved_context(client):
    equipment, _ = await create_equipment(client, configuration="x" * 4000)
    await create_service(client, equipment["id"], notes="y" * 4000)
    response = await client.post(
        "/api/v1/cases",
        data={
            "source": "upload",
            "symptom": "Clicking",
            "equipment_id": equipment["id"],
        },
        files={"image": ("bike.png", photo(), "image/png")},
    )
    assert response.status_code == 201
    assert len(response.json()["context"]["configuration"]) == 4000
    assert len(response.json()["context"]["service"]) == 4000
