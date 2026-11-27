"""Extended business endpoints: expense creation and the cashbox (3A-921 B1).

Extracted verbatim from extended_api.py; the endpoints register
on the one shared router from extended_common, and extended_api.py
imports this module in the original registration order.
"""
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import Depends, HTTPException, Query
from sqlalchemy import (
    select,
)
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.extended_common import (
    ZERO,
    CashboxCloseInput,
    CashboxEntryInput,
    ExpenseInput,
    _authorized,
    _commit,
    _dict,
    router,
)
from app.models import (
    AuditEvent,
    CashboxClosing,
    CashboxEntry,
)
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
)
from app.services import create_expense


@router.post("/expenses", status_code=201)
def post_expense(business_id: UUID, body: ExpenseInput,
                 session: Session = Depends(get_session),
                 principal: AuthenticatedPrincipal = Depends(get_principal)):
    item = _commit(session, lambda: create_expense(
        session, principal=principal, business_id=business_id, **body.model_dump()))
    return _dict(item, ("id", "business_id", "category", "description", "amount",
                        "currency_code", "incurred_at", "vendor_name", "reference", "created_at"))


def _cashbox_signed_amount(kind: str, amount: Decimal) -> Decimal:
    """Signed contribution of one cashbox entry to the balance."""
    return -amount if kind == "withdrawal" else amount


def _cashbox_balance(entries) -> Decimal:
    """The cashbox balance is computed from signed entries, never stored."""
    total = ZERO
    for entry in entries:
        total += _cashbox_signed_amount(entry.kind, Decimal(str(entry.amount or ZERO)))
    return total


def _cashbox_entries_for(session: Session, business_id: UUID, currency_code: str):
    return session.scalars(select(CashboxEntry).where(
        CashboxEntry.business_id == business_id,
        CashboxEntry.currency_code == currency_code,
    )).all()


@router.post("/cashbox/entries", status_code=201)
def post_cashbox_entry(business_id: UUID, body: CashboxEntryInput,
                       session: Session = Depends(get_session),
                       principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Record one physical-cash movement (C3, 3A-727).

    Any member may record a movement — the same pattern as
    expenses and payments; the daily close is the owner-only
    control point. A withdrawal larger than the current balance
    is rejected: the drawer cannot pay out cash it does not hold.
    """
    try:
        _authorized(session, principal, business_id)
        if body.kind == "withdrawal":
            balance = _cashbox_balance(
                _cashbox_entries_for(session, business_id, body.currency_code)
            )
            if body.amount > balance:
                raise HTTPException(
                    status_code=422,
                    detail="Withdrawal exceeds the current cashbox balance",
                )
        entry = CashboxEntry(
            business_id=business_id, kind=body.kind, amount=body.amount,
            currency_code=body.currency_code, reason=body.reason,
            reference=body.reference, recorded_by=principal.subject,
        )
        session.add(entry)
        session.flush()
        action = {
            "opening": "cashbox.opened",
            "deposit": "cashbox.deposit",
            "withdrawal": "cashbox.withdrawal",
        }[body.kind]
        session.add(AuditEvent(
            business_id=business_id, actor_subject=principal.subject,
            action=action, target_type="cashbox_entry", target_id=str(entry.id),
            change_summary=(
                f"Cashbox {body.kind} of {body.amount} {body.currency_code}: "
                f"{body.reason}"
            ),
        ))
        session.commit()
        return _dict(entry, ("id", "business_id", "kind", "amount", "currency_code",
                             "reason", "reference", "recorded_by", "created_at"))
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/cashbox/balance")
def cashbox_balance(business_id: UUID,
                    session: Session = Depends(get_session),
                    principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Current computed balance per currency, with the entry count."""
    try:
        _authorized(session, principal, business_id)
        entries = session.scalars(select(CashboxEntry).where(
            CashboxEntry.business_id == business_id,
        )).all()
        by_currency: dict[str, list] = {}
        for entry in entries:
            by_currency.setdefault(entry.currency_code, []).append(entry)
        return {
            "balances": [
                {
                    "currency_code": currency,
                    "balance": str(_cashbox_balance(rows)),
                    "entry_count": len(rows),
                }
                for currency, rows in sorted(by_currency.items())
            ],
            "note": (
                "The balance is computed from signed cashbox entries "
                "(opening + deposits - withdrawals); it is not a bank "
                "balance and not a ledger balance."
            ),
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/cashbox/entries")
def list_cashbox_entries(business_id: UUID, kind: str | None = Query(default=None),
                         limit: int = Query(default=100, ge=1, le=200),
                         offset: int = Query(default=0, ge=0),
                         session: Session = Depends(get_session),
                         principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        statement = select(CashboxEntry).where(
            CashboxEntry.business_id == business_id,
        )
        if kind is not None:
            statement = statement.where(CashboxEntry.kind == kind)
        items = session.scalars(
            statement.order_by(CashboxEntry.created_at.desc(), CashboxEntry.id.desc())
            .offset(offset).limit(limit)
        ).all()
        return [_dict(item, ("id", "business_id", "kind", "amount", "currency_code",
                             "reason", "reference", "recorded_by", "created_at"))
                for item in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/cashbox/close", status_code=201)
def close_cashbox(business_id: UUID, body: CashboxCloseInput,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Close the cashbox for a day, with a handover receipt (C3).

    Owner-only: the close is the control point. Expected is the
    computed balance; counted is what was physically in the
    drawer; variance is counted minus expected and may be
    negative. One closing per business, currency and day.
    """
    try:
        _authorized(session, principal, business_id, owner_only=True)
        closed_date = body.closed_date or datetime.now(UTC).date()
        existing = session.scalar(select(CashboxClosing).where(
            CashboxClosing.business_id == business_id,
            CashboxClosing.currency_code == body.currency_code,
            CashboxClosing.closed_date == closed_date,
        ))
        if existing is not None:
            raise HTTPException(
                status_code=422,
                detail="The cashbox is already closed for this currency and day",
            )
        expected = _cashbox_balance(
            _cashbox_entries_for(session, business_id, body.currency_code)
        )
        closing = CashboxClosing(
            business_id=business_id, closed_date=closed_date,
            currency_code=body.currency_code, expected_amount=expected,
            counted_amount=body.counted_amount,
            variance=body.counted_amount - expected,
            handed_by=body.handed_by, received_by=body.received_by,
            note=body.note,
        )
        session.add(closing)
        session.flush()
        session.add(AuditEvent(
            business_id=business_id, actor_subject=principal.subject,
            action="cashbox.closed", target_type="cashbox_closing",
            target_id=str(closing.id),
            change_summary=(
                f"Cashbox closed for {closed_date.isoformat()}: expected "
                f"{expected} {body.currency_code}, counted "
                f"{body.counted_amount}, variance {closing.variance}; "
                f"handed by {body.handed_by} to {body.received_by}"
            ),
        ))
        session.commit()
        return _dict(closing, ("id", "business_id", "closed_date", "currency_code",
                               "expected_amount", "counted_amount", "variance",
                               "handed_by", "received_by", "note", "created_at"))
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/cashbox/closings")
def list_cashbox_closings(business_id: UUID,
                          limit: int = Query(default=100, ge=1, le=200),
                          offset: int = Query(default=0, ge=0),
                          session: Session = Depends(get_session),
                          principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(CashboxClosing).where(
            CashboxClosing.business_id == business_id,
        ).order_by(CashboxClosing.closed_date.desc(), CashboxClosing.id.desc())
            .offset(offset).limit(limit)).all()
        return [_dict(item, ("id", "business_id", "closed_date", "currency_code",
                             "expected_amount", "counted_amount", "variance",
                             "handed_by", "received_by", "note", "created_at"))
                for item in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

