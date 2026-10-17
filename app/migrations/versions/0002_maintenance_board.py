"""Track approved maintenance work through the Kanban board."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "service_tasks",
        sa.Column("board_status", sa.String(20), nullable=False, server_default="todo"),
    )
    op.execute(
        "UPDATE service_tasks SET board_status = 'done' "
        "WHERE id IN (SELECT task_id FROM outcomes)"
    )
    op.create_check_constraint(
        "ck_service_tasks_board_status",
        "service_tasks",
        "board_status IN ('todo', 'in_progress', 'done')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_service_tasks_board_status", "service_tasks", type_="check")
    op.drop_column("service_tasks", "board_status")
