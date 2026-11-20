"""Safe CSV primitives for business data exchange.

Only explicitly supported columns are accepted. Tenant IDs, database IDs, status fields,
and secrets are never importable from CSV. File transport and database orchestration are
kept in the authenticated API layer.
"""
import csv
import io
from typing import Iterable, Mapping

MAX_CSV_BYTES = 5 * 1024 * 1024
MAX_CSV_ROWS = 10_000

IMPORT_COLUMNS: dict[str, tuple[str, ...]] = {
    "customers": ("name", "email", "phone", "address", "notes"),
    "products": ("sku", "name", "description", "unit", "unit_price", "is_stock_tracked"),
    "expenses": (
        "category", "description", "amount", "currency_code", "incurred_at",
        "vendor_name", "reference",
    ),
}
REQUIRED_COLUMNS: dict[str, frozenset[str]] = {
    "customers": frozenset({"name"}),
    "products": frozenset({"name", "unit_price"}),
    "expenses": frozenset({"category", "description", "amount", "currency_code", "incurred_at"}),
}


class CsvValidationError(ValueError):
    """CSV input is malformed, too large, or outside the supported schema."""


def parse_import_csv(content: str, *, entity_type: str) -> list[dict[str, str]]:
    """Parse a bounded CSV import while rejecting unknown and duplicate headers."""
    if entity_type not in IMPORT_COLUMNS:
        raise CsvValidationError("Unsupported import entity type")
    if len(content.encode("utf-8")) > MAX_CSV_BYTES:
        raise CsvValidationError("CSV exceeds the 5 MiB limit")
    if not content.strip():
        raise CsvValidationError("CSV content is empty")
    try:
        reader = csv.DictReader(io.StringIO(content, newline=""))
        headers = reader.fieldnames
        if not headers or any(not header or not header.strip() for header in headers):
            raise CsvValidationError("CSV must have a header row with named columns")
        normalized = [header.strip() for header in headers]
        if len(normalized) != len(set(normalized)):
            raise CsvValidationError("CSV headers must be unique")
        allowed = set(IMPORT_COLUMNS[entity_type])
        unknown = set(normalized) - allowed
        if unknown:
            raise CsvValidationError(f"Unsupported columns: {', '.join(sorted(unknown))}")
        missing = REQUIRED_COLUMNS[entity_type] - set(normalized)
        if missing:
            raise CsvValidationError(f"Missing required columns: {', '.join(sorted(missing))}")
        rows: list[dict[str, str]] = []
        for raw in reader:
            if None in raw:
                raise CsvValidationError("A row contains more values than the header")
            row = {key.strip(): (value or "").strip() for key, value in raw.items()}
            if not any(row.values()):
                continue
            rows.append(row)
            if len(rows) > MAX_CSV_ROWS:
                raise CsvValidationError("CSV exceeds the 10,000-row limit")
        return rows
    except csv.Error as exc:
        raise CsvValidationError("CSV could not be parsed") from exc


def _spreadsheet_safe(value: object) -> str:
    text = "" if value is None else str(value)
    # Prefix spreadsheet formula initiators to reduce CSV formula-injection risk.
    if text[:1] in {"=", "+", "-", "@", "\t", "\r"}:
        return "'" + text
    return text


def export_csv(
    rows: Iterable[Mapping[str, object]], *, columns: tuple[str, ...],
) -> str:
    """Serialize allowlisted columns with standard CSV quoting and formula protection."""
    if not columns or len(columns) != len(set(columns)):
        raise CsvValidationError("Export columns must be non-empty and unique")
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=list(columns), extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: _spreadsheet_safe(row.get(column)) for column in columns})
    return buffer.getvalue()
