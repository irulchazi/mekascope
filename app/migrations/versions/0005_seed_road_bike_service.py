"""Seed the road bike's initial service history."""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Resolve the actual equipment ID: migration 0004 may have reused an
    # existing asset with this serial number instead of creating the seed ID.
    op.execute(
        """
        WITH road_bike AS (
            SELECT id FROM equipment
            WHERE id = '8a31da2e-d0a5-45ec-8be0-3cfaf67263f7'::uuid
               OR serial_number = '2026/07/07-ELE-CRD'
            ORDER BY
                CASE WHEN id = '8a31da2e-d0a5-45ec-8be0-3cfaf67263f7'::uuid
                     THEN 0 ELSE 1 END,
                created_at, id
            LIMIT 1
        )
        INSERT INTO service_records
            (id, equipment_id, title, performed_on, service_type, performed_by, notes)
        SELECT
            'f7c4f9e0-15cc-49c8-90e5-84ea1c2c6ac7'::uuid,
            road_bike.id,
            'RD adjuster',
            DATE '2026-08-17',
            'maintenance',
            'Bike Technician',
            'Adjust the RD for better gear shifting.'
        FROM road_bike
        WHERE NOT EXISTS (
            SELECT 1 FROM service_records
            WHERE id = 'f7c4f9e0-15cc-49c8-90e5-84ea1c2c6ac7'::uuid
               OR (
                    equipment_id = road_bike.id
                    AND title = 'RD adjuster'
                    AND performed_on = DATE '2026-08-17'
                    AND service_type = 'maintenance'
               )
        )
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    # Preserve recorded service history and any edits made after seeding.
    pass
