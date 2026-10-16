"""Relational identities and bounded JSON snapshots of validated AI results."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    symptom: Mapped[str] = mapped_column(Text)
    context: Mapped[dict] = mapped_column(JSONB)
    scan: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    investigation: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    verification: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    steps: Mapped[list] = mapped_column(JSONB, default=list)
    operation: Mapped[str | None] = mapped_column(String(30))
    claim_token: Mapped[UUID | None]
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    ai_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)


class Image(Base):
    __tablename__ = "images"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    case_id: Mapped[UUID] = mapped_column(ForeignKey("cases.id"), index=True)
    step_id: Mapped[str | None] = mapped_column(String(60))
    mime_type: Mapped[str] = mapped_column(String(30))
    data: Mapped[bytes] = mapped_column(LargeBinary)


class ServiceTask(Base):
    __tablename__ = "service_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[UUID] = mapped_column(ForeignKey("cases.id"), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    recommendation: Mapped[dict] = mapped_column(JSONB)


class Outcome(Base):
    __tablename__ = "outcomes"

    task_id: Mapped[int] = mapped_column(
        ForeignKey("service_tasks.id"), primary_key=True
    )
    resolved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    notes: Mapped[str] = mapped_column(Text)
