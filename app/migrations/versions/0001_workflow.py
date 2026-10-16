"""Persist cases, images, approved tasks, and outcomes."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cases",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("symptom", sa.Text(), nullable=False),
        sa.Column("context", JSONB(), nullable=False),
        sa.Column("scan", JSONB()),
        sa.Column("investigation", JSONB()),
        sa.Column("verification", JSONB()),
        sa.Column("steps", JSONB(), nullable=False),
        sa.Column("operation", sa.String(30)),
        sa.Column("claim_token", sa.Uuid()),
        sa.Column("claimed_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
        sa.Column("ai_metadata", JSONB(), nullable=False),
    )
    op.create_table(
        "images",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("case_id", sa.Uuid(), sa.ForeignKey("cases.id"), nullable=False),
        sa.Column("step_id", sa.String(60)),
        sa.Column("mime_type", sa.String(30), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
    )
    op.create_index("ix_images_case_id", "images", ["case_id"])
    op.create_table(
        "service_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "case_id", sa.Uuid(), sa.ForeignKey("cases.id"), nullable=False, unique=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("recommendation", JSONB(), nullable=False),
    )
    op.create_table(
        "outcomes",
        sa.Column(
            "task_id", sa.Integer(), sa.ForeignKey("service_tasks.id"), primary_key=True
        ),
        sa.Column(
            "resolved_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("outcomes")
    op.drop_table("service_tasks")
    op.drop_table("images")
    op.drop_table("cases")
