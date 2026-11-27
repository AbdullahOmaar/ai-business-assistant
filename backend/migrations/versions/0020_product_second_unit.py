"""Add the second selling unit on products + the sold unit on invoice lines (3A-920 step 3).

Revision ID: 0020_product_second_unit
Revises: 0019_employee_wage_basis
Create Date: 2026-11-27

All additive, no existing column or calculation changes:

- ``products.second_unit_name`` + ``products.conversion_factor``: the
  company's own second selling unit (e.g. a trip) and how many base
  units one second unit holds. Both set together or both null (CHECK);
  the factor is > 0 when set. The name/factor are company data, never
  code constants — the Shouna "trip = 4 meters" is an example, not a
  rule.
- ``invoice_lines.sold_unit`` + ``invoice_lines.conversion_factor``:
  the unit a line was sold in + the factor applied, snapshotted at
  creation so issue / void / sales-return math stays exact even if the
  product's factor changes later. Null = sold in the base unit.

Stock effects (app.services): issue deducts and void returns
``quantity x factor`` in BASE units; sales-return approval converts
the returned quantity with the line's snapshotted factor. The
movements ledger itself never changes — it stays base-unit only.
This is a product feature in the current movements ledger only; C1's
accounting-inventory door stays deferred by its decisions.

Rollback/recovery: downgrade drops the four columns. Applying this
migration remains subject to the repository release gates (exact SQL
review and disposable PostgreSQL CI validation first); the app does
not auto-run migrations at startup.
"""
import sqlalchemy as sa
from alembic import op

revision = "0020_product_second_unit"
down_revision = "0019_employee_wage_basis"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("second_unit_name", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "products",
        sa.Column("conversion_factor", sa.Numeric(14, 3), nullable=True),
    )
    op.create_check_constraint(
        "ck_products_second_unit_pair", "products",
        "(second_unit_name IS NULL) = (conversion_factor IS NULL)",
    )
    op.create_check_constraint(
        "ck_products_conversion_factor_positive", "products",
        "conversion_factor IS NULL OR conversion_factor > 0",
    )
    op.add_column(
        "invoice_lines",
        sa.Column("sold_unit", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "invoice_lines",
        sa.Column("conversion_factor", sa.Numeric(14, 3), nullable=True),
    )
    op.create_check_constraint(
        "ck_invoice_line_conversion_factor_positive", "invoice_lines",
        "conversion_factor IS NULL OR conversion_factor > 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_invoice_line_conversion_factor_positive", "invoice_lines", type_="check"
    )
    op.drop_column("invoice_lines", "conversion_factor")
    op.drop_column("invoice_lines", "sold_unit")
    op.drop_constraint(
        "ck_products_conversion_factor_positive", "products", type_="check"
    )
    op.drop_constraint("ck_products_second_unit_pair", "products", type_="check")
    op.drop_column("products", "conversion_factor")
    op.drop_column("products", "second_unit_name")
