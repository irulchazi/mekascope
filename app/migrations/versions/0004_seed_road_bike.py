"""Seed the default road bike on existing and newly initialized databases."""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Keep the seed values frozen in this migration. Reuse a manually saved
    # matching asset without replacing its identity, edits, or service history.
    op.execute(
        """
        INSERT INTO equipment
            (id, name, manufacturer, model, serial_number, configuration)
        SELECT
            '8a31da2e-d0a5-45ec-8be0-3cfaf67263f7'::uuid,
            'Road bike',
            'Element',
            'FRC 50 CRD',
            '2026/07/07-ELE-CRD',
            'Road bicycle; 2x10-speed drivetrain; Sensah Phi front and rear derailleur; Luce Alloy 170mm 50-34T; 11–28T cassette; Hydraulic Disc Brake Rotor 160mm.'
        WHERE NOT EXISTS (
            SELECT 1 FROM equipment
            WHERE id = '8a31da2e-d0a5-45ec-8be0-3cfaf67263f7'::uuid
               OR serial_number = '2026/07/07-ELE-CRD'
        )
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    # Equipment may have been edited or acquired service history after seeding.
    # Retain that user data when rolling back this data-only migration.
    pass
