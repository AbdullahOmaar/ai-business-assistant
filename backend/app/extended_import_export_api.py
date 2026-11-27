"""Extended business endpoints: summary report, CSV exports and imports (3A-921 B1).

Extracted verbatim from extended_api.py; the endpoints register
on the one shared router from extended_common, and extended_api.py
imports this module in the original registration order.
"""
import csv
import io
from datetime import datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from fastapi import Body, Depends, HTTPException, Query, Response
from sqlalchemy import (
    func,
    select,
)
from sqlalchemy.orm import Session

from app.data_exchange import CsvValidationError, parse_import_csv, spreadsheet_safe
from app.dependencies import get_principal, get_session
from app.extended_common import (
    ZERO,
    _authorized,
    _commit,
    _dict,
    router,
)
from app.models import (
    AuditEvent,
    Customer,
    Expense,
    ImportJob,
    Invoice,
    Product,
)
from app.rate_limit import rate_limit
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    apply_expense_visibility,
)
from app.services import WorkflowError


@router.get("/reports/summary")
def report_summary(business_id: UUID,
                   session: Session = Depends(get_session),
                   principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        membership = _authorized(session, principal, business_id)
        invoices = session.execute(select(Invoice.currency_code, func.count(Invoice.id),
            func.coalesce(func.sum(Invoice.total), 0)).where(
            Invoice.business_id == business_id, Invoice.status == "issued"
        ).group_by(Invoice.currency_code)).all()
        expense_statement = select(Expense.currency_code, func.count(Expense.id),
            func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.business_id == business_id
        )
        expense_statement = apply_expense_visibility(
            expense_statement, business_id=business_id, role=membership.role
        )
        expenses = session.execute(expense_statement.group_by(Expense.currency_code)).all()
        return {
            "issued_invoices_by_currency": [
                {"currency_code": currency, "count": count, "total": str(total)}
                for currency, count, total in invoices
            ],
            "expenses_by_currency": [
                {"currency_code": currency, "count": count, "total": str(total)}
                for currency, count, total in expenses
            ],
            "note": "Currency totals are intentionally not combined. These figures are totals, not profit or cash balance."
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/exports/{entity_type}.csv")
def export_csv(business_id: UUID, entity_type: str,
               ids: str | None = Query(default=None),
               session: Session = Depends(get_session),
               principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id, owner_only=True)
        # Bulk export (C8 Part 2, 3A-686): an optional comma-separated ids
        # filter narrows the export to the caller's multi-selection.
        wanted_ids: set[UUID] | None = None
        if ids:
            try:
                wanted_ids = {
                    UUID(part.strip()) for part in ids.split(",") if part.strip()
                }
            except ValueError:
                raise HTTPException(
                    status_code=422,
                    detail="ids must be comma-separated UUIDs",
                ) from None
        supported = {
            "customers": ("customers", ("id", "name", "email", "phone", "address", "created_at")),
            "products": ("products", ("id", "sku", "name", "unit", "unit_price", "is_stock_tracked", "created_at")),
            "expenses": ("expenses", ("id", "category", "description", "amount", "currency_code", "incurred_at", "vendor_name", "reference")),
        }
        if entity_type not in supported:
            raise HTTPException(status_code=404, detail="Unsupported export entity")
        from app.models import Customer
        _model_name, columns = supported[entity_type]
        model = {"customers": Customer, "products": Product, "expenses": Expense}[entity_type]
        rows = session.scalars(select(model).where(model.business_id == business_id)).all()
        if wanted_ids is not None:
            rows = [row for row in rows if row.id in wanted_ids]
        buffer = io.StringIO(newline="")
        writer = csv.writer(buffer)
        writer.writerow(columns)
        for row in rows:
            values = []
            for col in columns:
                value = getattr(row, col)
                if isinstance(value, datetime):
                    value = value.isoformat()
                elif isinstance(value, UUID):
                    value = str(value)
                elif isinstance(value, Decimal):
                    value = format(value, "f")
                text_value = "" if value is None else str(value)
                values.append(spreadsheet_safe(text_value))
            writer.writerow(values)
        return Response(content=buffer.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{entity_type}.csv"'})
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc



def _validate_import_rows(session: Session, business_id: UUID, entity_type: str,
                          rows: list[dict[str, str]]) -> list[dict]:
    errors: list[dict] = []
    first_sku_row: dict[str, int] = {}
    first_customer_email_row: dict[str, int] = {}
    existing_skus: set[str] = set()
    existing_customer_emails: set[str] = set()
    if entity_type == "customers":
        emails = [
            row.get("email", "").strip().casefold()
            for row in rows if row.get("email", "").strip()
        ]
        if emails:
            existing_customer_emails = {
                value.strip().casefold()
                for value in session.scalars(select(Customer.email).where(
                    Customer.business_id == business_id, Customer.email.is_not(None),
                    func.lower(Customer.email).in_(emails),
                )).all() if value
            }
    if entity_type == "products":
        skus = [row.get("sku", "").strip().casefold() for row in rows if row.get("sku", "").strip()]
        if skus:
            existing_skus = {value.casefold() for value in session.scalars(select(Product.sku).where(
                Product.business_id == business_id, Product.sku.is_not(None),
                func.lower(Product.sku).in_(skus),
            )).all() if value}
    for index, row in enumerate(rows, start=2):
        if entity_type == "customers":
            limits = {"name": 160, "email": 254, "phone": 32, "address": 500, "notes": 1000}
            for field, limit in limits.items():
                if len(row.get(field, "")) > limit:
                    errors.append({"row": index, "field": field, "code": "too_long", "max_length": limit})
            if not row.get("name", "").strip():
                errors.append({"row": index, "field": "name", "code": "required"})
            email = row.get("email", "").strip()
            key = email.casefold()
            if key:
                if key in first_customer_email_row:
                    errors.append({"row": index, "field": "email", "code": "duplicate_in_file",
                                   "first_row": first_customer_email_row[key]})
                else:
                    first_customer_email_row[key] = index
                if key in existing_customer_emails:
                    errors.append({"row": index, "field": "email", "code": "already_exists"})
        elif entity_type == "products":
            limits = {"sku": 80, "name": 160, "description": 1000, "unit": 32}
            for field, limit in limits.items():
                if len(row.get(field, "")) > limit:
                    errors.append({"row": index, "field": field, "code": "too_long", "max_length": limit})
            if not row.get("name", "").strip():
                errors.append({"row": index, "field": "name", "code": "required"})
            try:
                price = Decimal(row.get("unit_price", ""))
                if not price.is_finite() or price < ZERO or price.as_tuple().exponent < -2 or price.adjusted() > 11 or len(price.as_tuple().digits) > 14:
                    raise ValueError()
            except (InvalidOperation, TypeError, ValueError):
                errors.append({"row": index, "field": "unit_price", "code": "invalid_decimal"})
            tracked = row.get("is_stock_tracked", "").lower()
            if tracked not in {"true", "false", "1", "0", "yes", "no", ""}:
                errors.append({"row": index, "field": "is_stock_tracked", "code": "invalid_boolean"})
            sku = row.get("sku", "").strip()
            key = sku.casefold()
            if key:
                if key in first_sku_row:
                    errors.append({"row": index, "field": "sku", "code": "duplicate_in_file",
                                   "first_row": first_sku_row[key]})
                else:
                    first_sku_row[key] = index
                if key in existing_skus:
                    errors.append({"row": index, "field": "sku", "code": "already_exists"})
        elif entity_type == "expenses":
            limits = {"category": 80, "description": 500, "currency_code": 3,
                      "vendor_name": 160, "reference": 128}
            for field, limit in limits.items():
                if len(row.get(field, "")) > limit:
                    errors.append({"row": index, "field": field, "code": "too_long", "max_length": limit})
            try:
                amount = Decimal(row.get("amount", ""))
                if not amount.is_finite() or amount <= ZERO or amount.as_tuple().exponent < -2 or amount.adjusted() > 11 or len(amount.as_tuple().digits) > 14:
                    raise ValueError()
            except (InvalidOperation, TypeError, ValueError):
                errors.append({"row": index, "field": "amount", "code": "invalid_decimal"})
            currency = row.get("currency_code", "").upper()
            if len(currency) != 3 or not currency.isalpha():
                errors.append({"row": index, "field": "currency_code", "code": "invalid_currency"})
            try:
                datetime.fromisoformat(row.get("incurred_at", ""))
            except ValueError:
                errors.append({"row": index, "field": "incurred_at", "code": "invalid_datetime"})
    return errors


@router.post("/imports/{entity_type}.csv/preview")
def preview_import_csv(business_id: UUID, entity_type: str,
                       csv_text: str = Body(media_type="text/csv", max_length=5 * 1024 * 1024),
                       session: Session = Depends(get_session),
                       principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        if entity_type not in {"customers", "products"}:
            raise WorkflowError("CSV import supports customers and products only")
        try:
            rows = parse_import_csv(csv_text, entity_type=entity_type)
        except CsvValidationError as exc:
            raise WorkflowError(str(exc)) from exc
        if not rows:
            raise WorkflowError("CSV must contain at least one data row")
        errors = _validate_import_rows(session, business_id, entity_type, rows)
        return {"entity_type": entity_type, "row_count": len(rows), "valid": not errors,
                "errors": errors, "write_performed": False}
    return _commit(session, op)


@router.post("/imports/{entity_type}.csv", status_code=202, dependencies=[Depends(rate_limit("CSV_IMPORT", default_limit=20, per_business=True))])
def import_csv(business_id: UUID, entity_type: str,
               csv_text: str = Body(media_type="text/csv", max_length=2_000_000),
               session: Session = Depends(get_session),
               principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Atomically import a small CSV batch. Large files belong in a background job."""
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        schemas = {
            "customers": {"name", "email", "phone", "address", "notes"},
            "products": {"name", "sku", "description", "unit", "unit_price", "is_stock_tracked"},
        }
        if entity_type not in schemas:
            raise WorkflowError("CSV import supports customers and products only")
        allowed = schemas[entity_type]
        try:
            rows = parse_import_csv(csv_text, entity_type=entity_type)
        except CsvValidationError as exc:
            raise WorkflowError(str(exc)) from exc
        if not rows:
            raise WorkflowError("CSV must contain at least one data row")
        errors = _validate_import_rows(session, business_id, entity_type, rows)
        if errors:
            raise WorkflowError("CSV validation failed: " + "; ".join(
                f"row {item['row']} {item['field']} {item['code']}" for item in errors
            ))
        if len(rows) > 2000:
            raise WorkflowError("A single import is limited to 2000 rows")
        job = ImportJob(business_id=business_id, job_type="import",
                        entity_type=entity_type, status="processing", row_count=0)
        session.add(job)
        session.flush()
        for index, row in enumerate(rows, start=2):
            clean = row
            if set(clean) - allowed:
                raise WorkflowError(f"Unsupported column at CSV row {index}")
            if not clean.get("name"):
                raise WorkflowError(f"Name is required at CSV row {index}")
            if entity_type == "customers":
                session.add(Customer(
                    business_id=business_id, name=clean["name"],
                    email=clean.get("email") or None, phone=clean.get("phone") or None,
                    address=clean.get("address") or None, notes=clean.get("notes") or None,
                ))
            else:
                try:
                    price = Decimal(clean.get("unit_price", "0") or "0")
                except Exception as exc:
                    raise WorkflowError(f"Invalid unit_price at CSV row {index}") from exc
                if price < ZERO:
                    raise WorkflowError(f"Negative unit_price at CSV row {index}")
                tracked_text = clean.get("is_stock_tracked", "false").lower()
                if tracked_text not in {"true", "false", "1", "0", "yes", "no", ""}:
                    raise WorkflowError(f"Invalid is_stock_tracked at CSV row {index}")
                session.add(Product(
                    business_id=business_id, name=clean["name"], unit_price=price,
                    sku=clean.get("sku") or None, description=clean.get("description") or None,
                    unit=clean.get("unit") or "unit",
                    is_stock_tracked=tracked_text in {"true", "1", "yes"},
                ))
        job.status = "completed"
        job.row_count = len(rows)
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="data_import.completed", target_type="import_job", target_id=str(job.id),
            change_summary=f"{entity_type}: {len(rows)} rows"))
        session.flush()
        return job
    job = _commit(session, op)
    return _dict(job, ("id", "job_type", "entity_type", "status", "row_count", "created_at"))




