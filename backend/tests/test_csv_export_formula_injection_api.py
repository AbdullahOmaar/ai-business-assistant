"""Regression: the live CSV export route neutralizes spreadsheet formulas,
including formulas hidden behind leading whitespace.

The route must sanitize every exported cell through the shared
``spreadsheet_safe`` rule: a formula initiator (=, +, -, @) that appears
after leading spaces, tabs, carriage returns or newlines is still a formula
once the file is opened, because spreadsheet applications trim that
whitespace first. Normal values must pass through byte-identical.
"""

import csv
import io
from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_api import (
    _configure_test_identity,
    _restore_test_identity,
    _sales_return_fixture,
)

from app.main import app
from app.models import Customer, Expense

HOSTILE_CUSTOMER_NAMES = {
    " =2+5": "' =2+5",
    "\t=2+5": "'\t=2+5",
    "\n-2+5": "'\n-2+5",
    "  @SUM(1,1)": "'  @SUM(1,1)",
    '=HYPERLINK("https://bad.example","click")': '\'=HYPERLINK("https://bad.example","click")',
    "+2+5": "'+2+5",
    "-2+5": "'-2+5",
    "@SUM(1,1)": "'@SUM(1,1)",
    "\r=1+1": "'\r=1+1",
}

NORMAL_CUSTOMER_NAMES = ["Normal Customer", "O'Brien", "Acme, North", "123"]


def test_owner_export_neutralizes_whitespace_hidden_formulas():
    engine, business_id, _, _ = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    try:
        with Session(engine) as session:
            for name in list(HOSTILE_CUSTOMER_NAMES) + NORMAL_CUSTOMER_NAMES:
                session.add(Customer(business_id=business_id, name=name))
            session.commit()

        response = client.get(f"/api/v1/businesses/{business_id}/exports/customers.csv")
        assert response.status_code == 200, response.text

        rows = list(csv.DictReader(io.StringIO(response.text)))
        exported_names = {row["name"] for row in rows}
        for hostile, expected in HOSTILE_CUSTOMER_NAMES.items():
            assert expected in exported_names, (
                f"hostile cell {hostile!r} was not neutralized in the export"
            )
            assert hostile not in exported_names, (
                f"hostile cell {hostile!r} reached the export unsanitized"
            )
        for normal in NORMAL_CUSTOMER_NAMES:
            assert normal in exported_names, (
                f"normal value {normal!r} was changed by export sanitization"
            )
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_owner_expense_export_neutralizes_formulas_in_description():
    engine, business_id, _, _ = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    hostile = " =2+5"
    hostile_tab = "\t+2+5"
    normal = "Office supplies"
    try:
        with Session(engine) as session:
            for description in (hostile, hostile_tab, normal):
                session.add(Expense(
                    business_id=business_id, category="Office",
                    description=description, amount=Decimal("10.00"),
                    currency_code="EGP", incurred_at=datetime.now(UTC),
                ))
            session.commit()

        response = client.get(f"/api/v1/businesses/{business_id}/exports/expenses.csv")
        assert response.status_code == 200, response.text

        rows = list(csv.DictReader(io.StringIO(response.text)))
        descriptions = {row["description"] for row in rows}
        assert "'" + hostile in descriptions
        assert "'" + hostile_tab in descriptions
        assert hostile not in descriptions
        assert hostile_tab not in descriptions
        assert normal in descriptions
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()
