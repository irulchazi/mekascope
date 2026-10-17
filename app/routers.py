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
from app.models import Case, Equipment, Image, ServiceRecord, ServiceTask
from app.schemas import (
    Approval,
    CaseView,
    EquipmentInput,
    EquipmentView,
    MaintenanceTaskView,
    Resolution,
    ServiceRecordInput,
    ServiceRecordView,
    TaskPriorityUpdate,
    TaskStatusUpdate,
)
from app.services import (
    analyze,
    busy,
    get_case,
    maintenance_tasks,
    now,
    snapshot,
    transition_task,
)

router = APIRouter(prefix="/api/v1")


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.sessions() as db:
        yield db


Db = Annotated[AsyncSession, Depends(get_db)]


@router.get("/catalog", tags=["catalog"])
async def catalog() -> dict:
    return CATALOG


@router.get("/equipment", response_model=list[EquipmentView], tags=["equipment"])
async def list_equipment(db: Db):
    return (
        await db.scalars(
            select(Equipment).order_by(Equipment.created_at.desc(), Equipment.id)
        )
    ).all()


@router.post(
    "/equipment", response_model=EquipmentView, status_code=201, tags=["equipment"]
)
async def create_equipment(body: EquipmentInput, db: Db):
    equipment = Equipment(**body.model_dump())
    db.add(equipment)
    await db.commit()
    await db.refresh(equipment)
    return equipment


@router.put(
    "/equipment/{equipment_id}", response_model=EquipmentView, tags=["equipment"]
)
async def update_equipment(equipment_id: UUID, body: EquipmentInput, db: Db):
    equipment = await db.get(Equipment, equipment_id)
    if equipment is None:
        raise HTTPException(404, "Equipment not found.")
    for key, value in body.model_dump().items():
        setattr(equipment, key, value)
    await db.commit()
    await db.refresh(equipment)
    return equipment


@router.get(
    "/service-records", response_model=list[ServiceRecordView], tags=["service history"]
)
async def list_service_records(db: Db, equipment_id: UUID | None = None):
    query = select(ServiceRecord).order_by(
        ServiceRecord.performed_on.desc(),
        ServiceRecord.created_at.desc(),
        ServiceRecord.id,
    )
    if equipment_id is not None:
        query = query.where(ServiceRecord.equipment_id == equipment_id)
    return (await db.scalars(query)).all()


@router.post(
    "/service-records",
    response_model=ServiceRecordView,
    status_code=201,
    tags=["service history"],
)
async def create_service_record(body: ServiceRecordInput, db: Db):
    if await db.get(Equipment, body.equipment_id) is None:
        raise HTTPException(
            404, "Equipment not found. Save an equipment profile first."
        )
    record = ServiceRecord(**body.model_dump())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.put(
    "/service-records/{record_id}",
    response_model=ServiceRecordView,
    tags=["service history"],
)
async def update_service_record(record_id: UUID, body: ServiceRecordInput, db: Db):
    record = await db.get(ServiceRecord, record_id)
    if record is None:
        raise HTTPException(404, "Service record not found.")
    if await db.get(Equipment, body.equipment_id) is None:
        raise HTTPException(404, "Equipment not found.")
    for key, value in body.model_dump().items():
        setattr(record, key, value)
    await db.commit()
    await db.refresh(record)
    return record


@router.post("/images/preview", tags=["images"], response_class=Response)
async def preview_image(
    request: Request, image: Annotated[UploadFile, File()]
) -> Response:
    """Convert an upload to a browser-compatible photo without saving a case."""
    mime, data = await read_image(image, request.app.state.settings)
    return Response(
        data,
        media_type=mime,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.post("/cases", response_model=CaseView, status_code=201, tags=["cases"])
async def create_case(
    request: Request,
    db: Db,
    source: Annotated[Literal["sample", "upload"], Form()],
    symptom: Annotated[str, Form(min_length=1, max_length=4000)],
    configuration: Annotated[str, Form(max_length=4000)] = "",
    service: Annotated[str, Form(max_length=4000)] = "",
    equipment_id: Annotated[UUID | None, Form()] = None,
    image: Annotated[UploadFile | None, File()] = None,
) -> CaseView:
    symptom = symptom.strip()
    if not symptom:
        raise HTTPException(422, "Describe the symptom before starting a case.")
    settings = request.app.state.settings
    if source == "sample":
        if equipment_id is not None:
            raise HTTPException(
                422, "Use an uploaded photo with a saved equipment profile."
            )
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
        if equipment_id is not None:
            equipment = await db.get(Equipment, equipment_id)
            if equipment is None:
                raise HTTPException(404, "Equipment not found. Choose another profile.")
            records = (
                await db.scalars(
                    select(ServiceRecord)
                    .where(ServiceRecord.equipment_id == equipment_id)
                    .order_by(
                        ServiceRecord.performed_on.desc(),
                        ServiceRecord.created_at.desc(),
                        ServiceRecord.id,
                    )
                    .limit(20)
                )
            ).all()
            configuration_notes = "\n".join(
                filter(
                    None,
                    [
                        f"Manufacturer: {equipment.manufacturer}"
                        if equipment.manufacturer
                        else "",
                        f"Model: {equipment.model}" if equipment.model else "",
                        f"Serial number: {equipment.serial_number}"
                        if equipment.serial_number
                        else "",
                        equipment.configuration,
                    ],
                )
            )
            service_notes = "\n\n".join(
                f"{record.performed_on.isoformat()} — {record.title} ({record.service_type})\n"
                + (
                    f"Performed by: {record.performed_by}\n"
                    if record.performed_by
                    else ""
                )
                + record.notes
                for record in records
            )
            context.update(
                {
                    "equipment_id": str(equipment.id),
                    "name": equipment.name,
                    "model": equipment.model,
                    "configuration": "\n".join(
                        filter(None, [configuration_notes, configuration.strip()])
                    )[:4000],
                    "service": "\n\n".join(
                        filter(None, [service_notes, service.strip()])
                    )[:4000],
                }
            )
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
    if case.self_resolved_at:
        raise HTTPException(
            409, "This case was marked self-resolved; task approval is unavailable."
        )
    task = await db.scalar(select(ServiceTask).where(ServiceTask.case_id == case_id))
    if task:
        response.status_code = 200
    else:
        db.add(ServiceTask(case_id=case_id, recommendation=case.verification))
    await db.commit()
    return await snapshot(db, case, request.app.state.settings)


@router.post("/cases/{case_id}/self-resolve", response_model=CaseView, tags=["tasks"])
async def self_resolve_case(case_id: UUID, request: Request, db: Db) -> CaseView:
    case = await get_case(db, case_id, lock=True)
    settings = request.app.state.settings
    if not case.verification or busy(case, settings):
        raise HTTPException(
            409, "Complete guided verification before marking the case self-resolved."
        )
    task = await db.scalar(select(ServiceTask).where(ServiceTask.case_id == case_id))
    if task:
        raise HTTPException(
            409,
            "A task already exists for this case; resolve it from the maintenance board.",
        )
    if case.self_resolved_at is None:
        case.self_resolved_at = now()
    await db.commit()
    return await snapshot(db, case, settings)


@router.get("/tasks", response_model=list[MaintenanceTaskView], tags=["tasks"])
async def list_maintenance_tasks(db: Db) -> list[MaintenanceTaskView]:
    return await maintenance_tasks(db)


@router.put(
    "/tasks/{task_id}/status", response_model=MaintenanceTaskView, tags=["tasks"]
)
async def update_task_status(
    task_id: int, update: TaskStatusUpdate, db: Db
) -> MaintenanceTaskView:
    await transition_task(db, task_id, update.status, update.notes)
    return (await maintenance_tasks(db, task_id))[0]


@router.put(
    "/tasks/{task_id}/priority", response_model=MaintenanceTaskView, tags=["tasks"]
)
async def update_task_priority(
    task_id: int, update: TaskPriorityUpdate, db: Db
) -> MaintenanceTaskView:
    task = await db.scalar(
        select(ServiceTask).where(ServiceTask.id == task_id).with_for_update()
    )
    if task is None:
        raise HTTPException(404, "Task not found.")
    task.priority = update.priority
    await db.commit()
    return (await maintenance_tasks(db, task_id))[0]


@router.post("/tasks/{task_id}/resolve", response_model=CaseView, tags=["tasks"])
async def resolve_task(
    task_id: int, resolution: Resolution, request: Request, db: Db
) -> CaseView:
    task = await transition_task(db, task_id, "done", resolution.notes)
    return await snapshot(
        db, await get_case(db, task.case_id), request.app.state.settings
    )
