import pytest

from app.csv_tools import CsvValidationError, parse_import_csv, serialize_export_csv


def test_customer_csv_accepts_only_allowlisted_fields():
    rows = parse_import_csv("customers", "name,email\nAli,ali@example.com\n")
    assert rows == [{"name": "Ali", "email": "ali@example.com"}]


@pytest.mark.parametrize("header", [
    "name,business_id",
    "name,password_hash",
    "name,role",
    "name,unknown_field",
])
def test_import_rejects_internal_or_unknown_columns(header):
    with pytest.raises(CsvValidationError, match="Unsupported CSV columns"):
        parse_import_csv("customers", header + "\nAli,secret\n")


def test_import_rejects_duplicate_headers_and_missing_required_fields():
    with pytest.raises(CsvValidationError, match="Duplicate"):
        parse_import_csv("customers", "name,name\nAli,Ali\n")
    with pytest.raises(CsvValidationError, match="Missing required"):
        parse_import_csv("customers", "email\nali@example.com\n")


def test_import_enforces_row_limit_and_rejects_extra_cells():
    with pytest.raises(CsvValidationError, match="row limit"):
        parse_import_csv("customers", "name\nA\nB\n", max_rows=1)
    with pytest.raises(CsvValidationError, match="more values"):
        parse_import_csv("customers", "name,email\nAli,a@example.com,unexpected\n")


def test_export_escapes_spreadsheet_formula_prefixes():
    result = serialize_export_csv(
        ("name", "notes"),
        [{"name": "=HYPERLINK(\"https://bad.example\")", "notes": "  @SUM(A1:A2)"}],
    )
    assert "'=HYPERLINK" in result
    assert "'  @SUM" in result


def test_export_ignores_unrequested_fields():
    result = serialize_export_csv(("name",), [{"name": "Ali", "password": "never export"}])
    assert result == "name\r\nAli\r\n"
    assert "password" not in result


def test_import_rejects_unsupported_entity_and_empty_file():
    with pytest.raises(CsvValidationError, match="Unsupported"):
        parse_import_csv("payments", "amount\n10\n")
    with pytest.raises(CsvValidationError, match="empty"):
        parse_import_csv("customers", "")


def test_import_accepts_utf8_bom_and_rejects_short_rows():
    rows = parse_import_csv("customers", "\\ufeffname,email\\nAli,ali@example.com\\n")
    assert rows == [{"name": "Ali", "email": "ali@example.com"}]
    with pytest.raises(CsvValidationError, match="fewer values"):
        parse_import_csv("customers", "name,email\\nAli\\n")


def test_import_rejects_unterminated_quoted_fields_and_invalid_row_limit():
    with pytest.raises(CsvValidationError, match="Malformed"):
        parse_import_csv("customers", 'name,email\\n"Ali,ali@example.com\\n')
    with pytest.raises(CsvValidationError, match="at least 1"):
        parse_import_csv("customers", "name\\nAli\\n", max_rows=0)
