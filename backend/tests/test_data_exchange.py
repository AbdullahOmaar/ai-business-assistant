import csv
import io

import pytest

from app.data_exchange import CsvValidationError, export_csv, parse_import_csv


def test_customer_import_accepts_only_allowlisted_fields():
    assert parse_import_csv(
        "name,email\nAli,ali@example.test\n",
        entity_type="customers",
    ) == [{"name": "Ali", "email": "ali@example.test"}]


@pytest.mark.parametrize(
    "content",
    [
        "name,business_id\nAli,other-tenant\n",
        "name,name\nAli,Other\n",
        "email\nali@example.test\n",
        "name,email\nAli,ali@example.test,extra\n",
    ],
)
def test_import_rejects_unknown_duplicate_missing_or_extra_columns(content):
    with pytest.raises(CsvValidationError):
        parse_import_csv(content, entity_type="customers")


def test_import_rejects_unsupported_entity_and_large_content():
    with pytest.raises(CsvValidationError, match="Unsupported"):
        parse_import_csv("name\nAli\n", entity_type="audit_events")
    with pytest.raises(CsvValidationError, match="5 MiB"):
        parse_import_csv("name,notes\n" + ("x" * (5 * 1024 * 1024)), entity_type="customers")


def test_export_quotes_csv_and_neutralizes_spreadsheet_formulas():
    content = export_csv(
        [{"name": "=HYPERLINK(\"https://bad.example\",\"click\")", "notes": "a,b"}],
        columns=("name", "notes"),
    )
    rows = list(csv.DictReader(io.StringIO(content)))
    assert rows == [{
        "name": "'=HYPERLINK(\"https://bad.example\",\"click\")",
        "notes": "a,b",
    }]
