# AI Assistant Source-Grounding Fix — 2026-10-29

## Scope
Keep the assistant read-only and tenant-scoped. This change corrects citations returned by the deterministic no-provider-key fallback; it does not change provider configuration, business calculations, or deployment settings.

## Behavior
- Sales/invoice answers cite only the recent issued invoices used in their totals.
- Expense answers cite only the recent expenses used in their totals.
- The preliminary invoice-minus-expense comparison cites both record sets and continues to state that it is not accounting net profit.
- Count and general/help answers return no invoice/expense citations because those records do not support those answers.
- Missing or duplicate source IDs are excluded/deduplicated.

## Verification gate
- Regression tests live in `backend/tests/test_assistant_security.py`.
- Run the full GitHub Actions workflow and require `all-checks-passed` on the exact PR head before merge.
- Provider-backed live behavior, authenticated production smoke, and production deployment remain separate gates; none is implied by these tests.
