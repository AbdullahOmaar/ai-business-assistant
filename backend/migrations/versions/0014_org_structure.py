"""Add org structure: departments, teams, assignment FKs (C8 Part 1).

Revision ID: 0014_org_structure
Revises: 0013_cashbox
Create Date: 2026-11-25

3A-392 / C8 (Phase 2). Two new tables (departments, teams) plus four
nullable assignment columns (employees + business_memberships). All
additive: no existing table, column or calculation changes. The
free-text Employee.department column stays untouched as legacy display
text; the new FKs are the authoritative structure.

Rollback/recovery: downgrade drops the four columns first, then both
tables. Applying this migration remains subject to the repository
release gates (exact SQL review and disposable PostgreSQL CI validation
first); the app does not auto-run migrations at startup.
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_org_structure"
down_revision = "0013_cashbox"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "departments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["departments.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "business_id", "name", name="uq_departments_business_name"
        ),
    )
    op.create_index(
        "ix_departments_business_parent",
        "departments", ["business_id", "parent_id"],
    )
    op.create_table(
        "teams",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("department_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["department_id"], ["departments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "business_id", "department_id", "name",
            name="uq_teams_business_department_name",
        ),
    )
    op.create_index(
        "ix_teams_business_department",
        "teams", ["business_id", "department_id"],
    )
    op.add_column(
        "employees",
        sa.Column("department_id", sa.Uuid(), nullable=True),
    )
    op.add_column("employees", sa.Column("team_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_employees_department_id", "employees", "departments",
        ["department_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_employees_team_id", "employees", "teams",
        ["team_id"], ["id"], ondelete="SET NULL",
    )
    op.add_column(
        "business_memberships",
        sa.Column("department_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "business_memberships", sa.Column("team_id", sa.Uuid(), nullable=True)
    )
    op.create_foreign_key(
        "fk_business_memberships_department_id", "business_memberships",
        "departments", ["department_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_business_memberships_team_id", "business_memberships", "teams",
        ["team_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_business_memberships_team_id", "business_memberships",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_business_memberships_department_id", "business_memberships",
        type_="foreignkey",
    )
    op.drop_column("business_memberships", "team_id")
    op.drop_column("business_memberships", "department_id")
    op.drop_constraint("fk_employees_team_id", "employees", type_="foreignkey")
    op.drop_constraint(
        "fk_employees_department_id", "employees", type_="foreignkey"
    )
    op.drop_column("employees", "team_id")
    op.drop_column("employees", "department_id")
    op.drop_index("ix_teams_business_department", table_name="teams")
    op.drop_table("teams")
    op.drop_index("ix_departments_business_parent", table_name="departments")
    op.drop_table("departments")
