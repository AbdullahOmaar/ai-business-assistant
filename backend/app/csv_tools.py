"""Safe CSV helpers for future authenticated import/export endpoints.

This module performs parsing and serialization only; callers must authorize the
business, validate each row against the target model, and record job metadata.
Spreadsheet formula prefixes are escaped on export to reduce CSV injection risk.
"""
import csv
import io
from collections.abc import Iterable, Mapping

ALLOWED_IMPORT_FIELDS: dict[str, tuple[str, ...]] = {
    "customers": ("name", "email", "phone", "address", "notes"),
    "products": ("sku", "name", "description", "unit", "unit_price", "is_stock_tracked"),
    "expenses": ("category", "description", "amount", "currency_code", "incurred_at", "vendor_name", "reference"),
}
FORMULA_PREFIXES = ("=", "+", "-", "@")


class CsvValidationError(ValueError):
    """Raised for malformed or unsafe CSV input."""


def parse_import_csv(entity_type: str, content: str, *, max_rows: int = 5000) -> list[dict[str, str]]:
    """Parse UTF-8 CSV using an explicit allowlist; reject unknown/internal columns."""
    if entity_type not in ALLOWED_IMPORT_FIELDS:
        raise CsvValidationError("Unsupported import entity type")
    if not content or len(content.encode("utf-8")) > 2_000_000:
        raise CsvValidationError("CSV content is empty or exceeds the 2 MB limit")
    content = content.removeprefix("\\ufeff")
    if max_rows < 1:
        raise CsvValidationError("max_rows must be at least 1")
    try:
        reader = csv.DictReader(io.StringIO(content, newline=""), strict=True)
        headers = reader.fieldnames
        if not headers or any(not h or h.strip() != h for h in headers):
            raise CsvValidationError("CSV header row is missing or malformed")
        if len(headers) != len(set(headers)):
            raise CsvValidationError("Duplicate CSV columns are not allowed")
        allowed = set(ALLOWED_IMPORT_FIELDS[entity_type])
        unknown = set(headers) - allowed
        if unknown:
            raise CsvValidationError("Unsupported CSV columns: " + ", ".join(sorted(unknown)))
        required = {"name"} if entity_type in {"customers", "products"} else {"category", "description", "amount", "currency_code", "incurred_at"}
        if not required.issubset(headers):
            raise CsvValidationError("Missing required columns: " + ", ".join(sorted(required - set(headers))))
        rows: list[dict[str, str]] = []
        for row in reader:
            if None in row:
                raise CsvValidationError("A row has more values than the header")
            if any(value is None for value in row.values()):
                raise CsvValidationError("A row has fewer values than the header")
            if not any((value or "").strip() for value in row.values()):
                continue
            if len(rows) >= max_rows:
                raise CsvValidationError(f"CSV exceeds the {max_rows} row limit")
            rows.append({key: (value or "").strip() for key, value in row.items()})
        return rows
    except csv.Error as exc:
        raise CsvValidationError("Malformed CSV input") from exc


def _spreadsheet_safe(value: object) -> str:
    text = "" if value is None else str(value)
    # Leading whitespace/control chars are ignored by some spreadsheet apps.
    probe = text.lstrip(" \t\r\n")
    if probe.startswith(FORMULA_PREFIXES):
        return "'" + text
    return text


def serialize_export_csv(columns: tuple[str, ...], rows: Iterable[Mapping[str, object]]) -> str:
    """Serialize only caller-selected columns and neutralize formula-like cells."""
    if not columns or len(columns) != len(set(columns)):
        raise CsvValidationError("Export columns must be non-empty and unique")
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=list(columns), extrasaction="ignore", lineterminator="\r\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: _spreadsheet_safe(row.get(column)) for column in columns})
    return output.getvalue()
