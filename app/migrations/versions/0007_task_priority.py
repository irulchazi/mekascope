"""Allow people to set task priority without changing the AI recommendation."""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("service_tasks", sa.Column("priority", sa.String(20), nullable=True))
    op.create_check_constraint(
        "ck_service_tasks_priority",
        "service_tasks",
        "priority IS NULL OR priority IN ('low', 'medium', 'high', 'unknown')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_service_tasks_priority", "service_tasks", type_="check")
    op.drop_column("service_tasks", "priority")
