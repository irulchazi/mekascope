"""HTTP interface for the bicycle workflow."""

import asyncio
from collections.abc import AsyncIterator
from typing import Annotated, Literal
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog import CATALOG, SAMPLE_CONTEXT, SAMPLE_IMAGE
from app.images import normalize_image, read_image
from app.models import Case, Image, Outcome, ServiceTask
from app.schemas import Approval, CaseView, Resolution
from app.services import analyze, busy, get_case, snapshot

router = APIRouter(prefix="/api/v1")


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.sessions() as db:
        yield db


Db = Annotated[AsyncSession, Depends(get_db)]


@router.get("/catalog", tags=["catalog"])
async def catalog() -> dict:
    return CATALOG


@router.post("/cases", response_model=CaseView, status_code=201, tags=["cases"])
async def create_case(
    request: Request,
    db: Db,
    source: Annotated[Literal["sample", "upload"], Form()],
    symptom: Annotated[str, Form(min_length=1, max_length=4000)],
    configuration: Annotated[str, Form(max_length=4000)] = "",
    service: Annotated[str, Form(max_length=4000)] = "",
    image: Annotated[UploadFile | None, File()] = None,
) -> CaseView:
    symptom = symptom.strip()
    if not symptom:
        raise HTTPException(422, "Describe the symptom before starting a case.")
    settings = request.app.state.settings
    if source == "sample":
        if image is not None:
            raise HTTPException(422, "Choose either the sample or an uploaded photo.")
        data = await asyncio.to_thread(SAMPLE_IMAGE.read_bytes)
        mime, data = await asyncio.to_thread(normalize_image, data)
        context = {**SAMPLE_CONTEXT}
        if configuration.strip():
            context["configuration"] += "\nUser note: " + configuration.strip()
        if service.strip():
            context["service"] += "\nUser note: " + service.strip()
    else:
        if image is None:
            raise HTTPException(422, "Upload a photo to start this case.")
        mime, data = await read_image(image, settings)
        context = {
            "source": "user",
            "name": "Uploaded bicycle",
            "configuration": configuration.strip(),
            "service": service.strip(),
        }
    case = Case(symptom=symptom, context=context)
    db.add(case)
    await db.flush()
    db.add(Image(case_id=case.id, mime_type=mime, data=data))
    await db.commit()
    return await snapshot(db, case, settings)


@router.get("/cases/{case_id}", response_model=CaseView, tags=["cases"])
async def read_case(case_id: UUID, request: Request, db: Db) -> CaseView:
    return await snapshot(db, await get_case(db, case_id), request.app.state.settings)


@router.get(
    "/cases/{case_id}/images/{image_id}",
    tags=["cases"],
    responses={200: {"content": {"image/jpeg": {}}}},
)
async def read_case_image(case_id: UUID, image_id: UUID, db: Db) -> Response:
    image = await db.scalar(
        select(Image).where(Image.id == image_id, Image.case_id == case_id)
    )
    if image is None:
        raise HTTPException(404, "Image not found in this case.")
    return Response(
        image.data,
        media_type=image.mime_type,
        headers={
            "Cache-Control": "private, no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/cases/{case_id}/scan", response_model=CaseView, tags=["analysis"])
async def scan(case_id: UUID, request: Request, db: Db) -> CaseView:
    return await analyze(
        db, case_id, "scan", request.app.state.settings, request.app.state.provider
    )


@router.post("/cases/{case_id}/investigate", response_model=CaseView, tags=["analysis"])
async def investigate(case_id: UUID, request: Request, db: Db) -> CaseView:
    return await analyze(
        db,
        case_id,
        "investigate",
        request.app.state.settings,
        request.app.state.provider,
    )


@router.put(
    "/cases/{case_id}/verification-steps/{step_id}",
    response_model=CaseView,
    tags=["verification"],
)
async def save_step(
    case_id: UUID,
    step_id: str,
    request: Request,
    db: Db,
    completed: Annotated[bool, Form()],
    observation: Annotated[str, Form(max_length=4000)] = "",
    image: Annotated[UploadFile | None, File()] = None,
) -> CaseView:
    settings = request.app.state.settings
    photo = await read_image(image, settings) if image else None
    case = await get_case(db, case_id, lock=True)
    if case.verification or busy(case, settings):
        raise HTTPException(
            409,
            "Verification is running or finalized; start a new case to change evidence.",
        )
    steps = [dict(step) for step in case.steps]
    step = next((step for step in steps if step["id"] == step_id), None)
    if step is None:
        raise HTTPException(404, "Verification step not found.")
    step.update(completed=completed, observation=observation.strip())
    if photo:
        stored = await db.scalar(
            select(Image).where(Image.case_id == case_id, Image.step_id == step_id)
        )
        if stored is None:
            stored = Image(
                case_id=case_id, step_id=step_id, mime_type=photo[0], data=photo[1]
            )
            db.add(stored)
            await db.flush()
        else:
            stored.mime_type, stored.data = photo
        step["image_url"] = f"/api/v1/cases/{case_id}/images/{stored.id}"
    case.steps = steps
    await db.commit()
    return await snapshot(db, case, settings)


@router.post("/cases/{case_id}/verify", response_model=CaseView, tags=["verification"])
async def verify(case_id: UUID, request: Request, db: Db) -> CaseView:
    return await analyze(
        db, case_id, "verify", request.app.state.settings, request.app.state.provider
    )


@router.post(
    "/cases/{case_id}/tasks", response_model=CaseView, status_code=201, tags=["tasks"]
)
async def approve_task(
    case_id: UUID, approval: Approval, request: Request, response: Response, db: Db
) -> CaseView:
    case = await get_case(db, case_id, lock=True)
    if not case.verification:
        raise HTTPException(
            409, "Complete guided verification before approving a task."
        )
    task = await db.scalar(select(ServiceTask).where(ServiceTask.case_id == case_id))
    if task:
        response.status_code = 200
    else:
        db.add(ServiceTask(case_id=case_id, recommendation=case.verification))
    await db.commit()
    return await snapshot(db, case, request.app.state.settings)


@router.post("/tasks/{task_id}/resolve", response_model=CaseView, tags=["tasks"])
async def resolve_task(
    task_id: int, resolution: Resolution, request: Request, db: Db
) -> CaseView:
    task = await db.scalar(
        select(ServiceTask).where(ServiceTask.id == task_id).with_for_update()
    )
    if task is None:
        raise HTTPException(404, "Task not found.")
    outcome = await db.get(Outcome, task_id)
    if outcome is None:
        db.add(
            Outcome(
                task_id=task_id,
                notes=resolution.notes.strip()
                or "Resolved by user; no additional observations supplied.",
            )
        )
    await db.commit()
    return await snapshot(
        db, await get_case(db, task.case_id), request.app.state.settings
    )
