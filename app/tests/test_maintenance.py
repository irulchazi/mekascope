"""Approved work persists across the Kanban board and inspection workflow."""

import asyncio
from uuid import uuid4

import psycopg
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url

from app.config import ROOT
from app.tests.support import temporary_database
from app.tests.test_workflow import new_case, verified


async def test_board_lists_only_approved_tasks_once(client):
    draft = await new_case(client)
    path, case = await verified(client)
    assert all(
        item["case_id"] != case["id"]
        for item in (await client.get("/api/v1/tasks")).json()
    )
    approval = await client.post(path + "/tasks", json={"approved": True})
    task_id = approval.json()["task"]["id"]
    assert approval.json()["task"]["board_status"] == "todo"
    await client.post(path + "/tasks", json={"approved": True})
    tasks = (await client.get("/api/v1/tasks")).json()
    matching = [item for item in tasks if item["id"] == task_id]
    assert len(matching) == 1
    assert matching[0]["case_id"] == case["id"]
    assert matching[0]["equipment"] == case["context"]["name"]
    assert matching[0]["component"] == case["scan"]["component"]
    assert matching[0]["recommendation"] == case["verification"]
    assert all(item["case_id"] != draft["id"] for item in tasks)


async def test_board_moves_persist_and_resolve_source_case(client):
    path, _ = await verified(client)
    task = (await client.post(path + "/tasks", json={"approved": True})).json()["task"]
    endpoint = f"/api/v1/tasks/{task['id']}/status"
    response = await client.put(endpoint, json={"status": "in_progress"})
    assert response.status_code == 200
    assert response.json()["board_status"] == "in_progress"
    restored = (await client.get(path)).json()["task"]
    assert restored["status"] == "open"
    assert restored["board_status"] == "in_progress"
    assert (await client.put(endpoint, json={"status": "todo"})).json()[
        "board_status"
    ] == "todo"
    response = await client.put(
        endpoint,
        json={"status": "done", "notes": "Indexing adjusted and shifting checked."},
    )
    assert response.status_code == 200
    restored = (await client.get(path)).json()["task"]
    assert restored["status"] == "resolved"
    assert restored["board_status"] == "done"
    assert restored["resolved_at"]
    assert restored["outcome_notes"] == "Indexing adjusted and shifting checked."
    await client.put(
        endpoint,
        json={"status": "done", "notes": "A retry must not replace the outcome."},
    )
    await client.post(f"/api/v1/tasks/{task['id']}/resolve", json={})
    assert (await client.get(path)).json()["task"]["outcome_notes"] == restored[
        "outcome_notes"
    ]
    assert (
        await client.put(endpoint, json={"status": "in_progress"})
    ).status_code == 409
    assert (await client.put(endpoint, json={"status": "invalid"})).status_code == 422
    assert (
        await client.put("/api/v1/tasks/999999/status", json={"status": "todo"})
    ).status_code == 404


async def test_resolving_from_act_updates_the_board(client):
    path, _ = await verified(client)
    task_id = (await client.post(path + "/tasks", json={"approved": True})).json()[
        "task"
    ]["id"]
    await client.post(
        f"/api/v1/tasks/{task_id}/resolve", json={"notes": "Completed from inspection."}
    )
    task = next(
        item
        for item in (await client.get("/api/v1/tasks")).json()
        if item["id"] == task_id
    )
    assert task["board_status"] == "done"
    assert task["outcome_notes"] == "Completed from inspection."


async def test_board_migration_backfills_existing_outcomes():
    async with temporary_database() as url:
        config = Config(str(ROOT / "app/alembic.ini"))
        config.attributes["database_url"] = url
        await asyncio.to_thread(command.downgrade, config, "0001")
        connection_url = (
            make_url(url)
            .set(drivername="postgresql")
            .render_as_string(hide_password=False)
        )
        async with await psycopg.AsyncConnection.connect(
            connection_url, autocommit=True
        ) as connection:
            task_ids = []
            for _ in range(2):
                case_id = uuid4()
                await connection.execute(
                    "INSERT INTO cases (id, symptom, context, steps, ai_metadata) VALUES (%s, 'Noise', '{}', '[]', '{}')",
                    (case_id,),
                )
                cursor = await connection.execute(
                    "INSERT INTO service_tasks (case_id, recommendation) VALUES (%s, '{}') RETURNING id",
                    (case_id,),
                )
                task_ids.append((await cursor.fetchone())[0])
            await connection.execute(
                "INSERT INTO outcomes (task_id, notes) VALUES (%s, 'Already resolved')",
                (task_ids[1],),
            )
            await asyncio.to_thread(command.upgrade, config, "head")
            cursor = await connection.execute(
                "SELECT id, board_status FROM service_tasks ORDER BY id"
            )
            assert await cursor.fetchall() == [
                (task_ids[0], "todo"),
                (task_ids[1], "done"),
            ]


async def test_task_priority_updates_persist_without_changing_ai_assessment(client):
    path, case = await verified(client)
    task = (await client.post(path + "/tasks", json={"approved": True})).json()["task"]
    assert task["priority"] == case["verification"]["severity"]
    endpoint = f"/api/v1/tasks/{task['id']}/priority"
    for priority in ("low", "medium", "high", "unknown"):
        response = await client.put(endpoint, json={"priority": priority})
        assert response.status_code == 200
        assert response.json()["priority"] == priority
        restored = (await client.get(path)).json()
        assert restored["task"]["priority"] == priority
        assert restored["task"]["recommendation"] == case["verification"]
        assert restored["verification"] == case["verification"]
        assert restored["task"]["board_status"] == "todo"
    assert (await client.put(endpoint, json={"priority": "urgent"})).status_code == 422
    assert (await client.put(endpoint, json={})).status_code == 422
    assert (
        await client.put("/api/v1/tasks/999999/priority", json={"priority": "low"})
    ).status_code == 404


async def test_priority_and_board_status_changes_do_not_overwrite_each_other(client):
    path, _ = await verified(client)
    task = (await client.post(path + "/tasks", json={"approved": True})).json()["task"]
    priority, status = await asyncio.gather(
        client.put(f"/api/v1/tasks/{task['id']}/priority", json={"priority": "high"}),
        client.put(
            f"/api/v1/tasks/{task['id']}/status", json={"status": "in_progress"}
        ),
    )
    assert priority.status_code == status.status_code == 200
    restored = (await client.get(path)).json()["task"]
    assert restored["priority"] == "high"
    assert restored["board_status"] == "in_progress"
