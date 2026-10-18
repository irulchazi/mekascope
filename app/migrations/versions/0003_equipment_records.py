"""Save equipment configuration and dated service records."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "equipment",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("manufacturer", sa.String(200), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("serial_number", sa.String(200), nullable=False),
        sa.Column("configuration", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_table(
        "service_records",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "equipment_id", sa.Uuid(), sa.ForeignKey("equipment.id"), nullable=False
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("performed_on", sa.Date(), nullable=False),
        sa.Column("service_type", sa.String(20), nullable=False),
        sa.Column("performed_by", sa.String(200), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "service_type IN ('maintenance', 'repair', 'inspection', 'upgrade')",
            name="ck_service_records_type",
        ),
    )
    op.create_index(
        "ix_service_records_equipment_id", "service_records", ["equipment_id"]
    )
    op.create_index(
        "ix_service_records_performed_on", "service_records", ["performed_on"]
    )


def downgrade() -> None:
    op.drop_table("service_records")
    op.drop_table("equipment")
