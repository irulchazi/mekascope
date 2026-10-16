"""Transactional workflow. Database locks are never held across provider calls."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException
from google.genai import errors
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import DiagnosisProvider
from app.config import Settings
from app.models import Case, Image, Outcome, ServiceTask
from app.schemas import (
    CaseView,
    InvestigationResult,
    ScanResult,
    TaskView,
    VerificationResult,
)

logger = logging.getLogger(__name__)
RESULTS = {
    "scan": ScanResult,
    "investigate": InvestigationResult,
    "verify": VerificationResult,
}
COLUMNS = {"scan": "scan", "investigate": "investigation", "verify": "verification"}


def now() -> datetime:
    return datetime.now(UTC)


async def get_case(db: AsyncSession, case_id: UUID, lock: bool = False) -> Case:
    statement = (
        select(Case).where(Case.id == case_id).execution_options(populate_existing=True)
    )
    if lock:
        statement = statement.with_for_update()
    case = await db.scalar(statement)
    if case is None:
        raise HTTPException(404, "Case not found.")
    return case


def busy(case: Case, settings: Settings) -> bool:
    return bool(
        case.operation
        and case.claimed_at
        and case.claimed_at + timedelta(seconds=settings.claim_timeout_seconds) > now()
    )


async def snapshot(db: AsyncSession, case: Case, settings: Settings) -> CaseView:
    image = await db.scalar(
        select(Image.id).where(Image.case_id == case.id, Image.step_id.is_(None))
    )
    task = await db.scalar(select(ServiceTask).where(ServiceTask.case_id == case.id))
    outcome = await db.get(Outcome, task.id) if task else None
    stages = ["observe"]
    if case.scan and case.scan["recognized"]:
        stages += ["understand", "investigate"]
    if case.investigation:
        stages += ["verify"]
    if case.verification:
        stages += ["act"]
    active = busy(case, settings)
    return CaseView(
        id=case.id,
        created_at=case.created_at,
        symptom=case.symptom,
        context=case.context,
        image_url=f"/api/v1/cases/{case.id}/images/{image}",
        available_stages=stages,
        scan=case.scan,
        investigation=case.investigation,
        verification=case.verification,
        steps=case.steps,
        operation=case.operation if active else None,
        operation_expires_at=case.claimed_at
        + timedelta(seconds=settings.claim_timeout_seconds)
        if active
        else None,
        last_error=case.last_error
        if not case.operation or active
        else "The previous analysis was interrupted. Retry the operation.",
        task=TaskView(
            id=task.id,
            created_at=task.created_at,
            status="resolved" if outcome else "open",
            recommendation=task.recommendation,
            resolved_at=outcome.resolved_at if outcome else None,
            outcome_notes=outcome.notes if outcome else None,
        )
        if task
        else None,
    )


async def analyze(
    db: AsyncSession,
    case_id: UUID,
    operation: str,
    settings: Settings,
    provider: DiagnosisProvider,
) -> CaseView:
    case = await get_case(db, case_id, lock=True)
    column = COLUMNS[operation]
    if getattr(case, column) is not None:
        return await snapshot(db, case, settings)
    if busy(case, settings):
        raise HTTPException(
            409,
            "Analysis is already running. Refresh this case to retrieve its result.",
        )
    if operation == "investigate" and not (case.scan and case.scan["recognized"]):
        raise HTTPException(409, "Recognize a bicycle component before investigating.")
    if operation == "verify" and not (
        case.investigation
        and case.steps
        and all(step["completed"] for step in case.steps)
    ):
        raise HTTPException(
            409, "Confirm every guided check before reassessing the diagnosis."
        )
    token = uuid4()
    case.operation, case.claim_token, case.claimed_at, case.last_error = (
        operation,
        token,
        now(),
        None,
    )
    payload = {"symptom": case.symptom, "context": case.context, "scan": case.scan}
    if operation == "verify":
        payload.update(investigation=case.investigation, checks=case.steps)
    images = list(
        (
            await db.scalars(
                select(Image)
                .where(Image.case_id == case_id)
                .order_by(Image.step_id.asc().nullsfirst())
            )
        ).all()
    )
    if operation != "verify":
        images = [image for image in images if image.step_id is None]
    payload["image_order"] = [image.step_id or "initial photo" for image in images]
    await db.commit()
    try:
        result = await asyncio.wait_for(
            provider.generate(
                operation,
                payload,
                [(i.mime_type, i.data) for i in images],
                RESULTS[operation],
            ),
            settings.ai_timeout_seconds,
        )
        # Also validate injected providers; no malformed result reaches persistence.
        result = RESULTS[operation].model_validate(result.model_dump())
        if isinstance(result, InvestigationResult):
            result.hypotheses.sort(key=lambda item: item.confidence, reverse=True)
        case = await get_case(db, case_id, lock=True)
        if case.claim_token != token or not busy(case, settings):
            raise HTTPException(409, "This analysis was superseded. Refresh the case.")
        setattr(case, column, result.model_dump())
        if isinstance(result, InvestigationResult):
            case.steps = [
                {
                    "id": str(uuid4()),
                    **check.model_dump(),
                    "completed": False,
                    "observation": "",
                    "image_url": None,
                }
                for check in result.checks
            ]
        case.ai_metadata = {
            **case.ai_metadata,
            operation: {
                "provider": "gemini",
                "model": settings.gemini_model,
                "prompt_version": "1",
                "at": now().isoformat(),
            },
        }
        case.operation, case.claim_token, case.claimed_at = None, None, None
        await db.commit()
        return await snapshot(db, case, settings)
    except BaseException as exc:
        await db.rollback()
        if isinstance(exc, HTTPException):
            error = exc
        elif isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
            error = HTTPException(
                504, "Gemini timed out. Your progress is saved; retry analysis."
            )
        elif isinstance(exc, errors.APIError) and exc.code == 402:
            error = HTTPException(
                503,
                "Gemini billing credits are depleted. Add credits in Google AI Studio, "
                "then retry analysis. Your uploaded image and case are saved.",
            )
        elif isinstance(exc, errors.APIError) and exc.code == 429:
            error = HTTPException(
                503,
                "Gemini quota is unavailable. Wait and retry.",
                headers={"Retry-After": "30"},
            )
        else:
            error = HTTPException(
                502,
                "Gemini could not return a valid diagnosis. Your progress is saved; retry analysis.",
            )
            if not isinstance(exc, asyncio.CancelledError):
                logger.warning("Analysis failed: %s", type(exc).__name__)
        if isinstance(exc, errors.APIError):
            # Log provider status without including credentials or user evidence.
            logger.warning("Gemini %s failed (upstream HTTP %s)", operation, exc.code)
        await db.execute(
            update(Case)
            .where(Case.id == case_id, Case.claim_token == token)
            .values(
                operation=None,
                claim_token=None,
                claimed_at=None,
                last_error=str(error.detail),
            )
        )
        await db.commit()
        if isinstance(exc, (asyncio.CancelledError, KeyboardInterrupt, SystemExit)):
            raise
        raise error from exc
