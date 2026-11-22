// Shared report-limitation key map (moved verbatim from the shell in the
// 3A-351 bundle batch, so the shell's taxes section and the extracted
// reports workspace share one map instead of duplicating it). Callers
// translate the returned key themselves; a null return means the value has
// no mapped key and renders as-is.

const REPORT_LIMITATION_KEYS: Readonly<Record<string, string>> = {
  "manual review only": "app.reportLimitation.1",
  "report is read-only": "app.reportLimitation.2",
  "amounts are separated by currency": "app.reportLimitation.3",
  "uses saved tax totals on issued invoices; it does not recalculate historical taxes.": "app.reportLimitation.4",
  "currency totals are kept separate and are not converted.": "app.reportLimitation.5",
  "this is an operational summary, not a jurisdiction-specific tax filing.": "app.reportLimitation.6",
  "revenue is based on issued invoice totals, not cash collected.": "app.reportLimitation.7",
  "invoice totals include stored tax amounts; approved sales returns are not netted from this figure.": "app.reportLimitation.8",
  "this result subtracts recorded expenses only and excludes cost of goods sold because product purchase costs are not yet linked to sales.": "app.reportLimitation.9",
  "tax liability treatment and tax allocation to returns are not represented as a complete accounting ledger.": "app.reportLimitation.10",
  "currency totals are kept separate and are never converted.": "app.reportLimitation.11",
  "only issued invoices with a positive remaining balance appear in aging buckets; drafts and void invoices are excluded.": "app.reportLimitation.12",
  "fully settled invoices are excluded from open receivables aging.": "app.reportLimitation.13",
  "overallocated invoices are excluded from receivable balances and shown as positive-excess data-quality warnings.": "app.reportLimitation.14",
  "invoices without due dates are reported separately and are not assumed current.": "app.reportLimitation.15",
  "legacy invoices without customer links are flagged for review, not auto-corrected.": "app.reportLimitation.16",
  "currency-mismatched allocations are listed as warnings and never reduce receivables.": "app.reportLimitation.17",
  "this is an accounts-receivable aging report, not net profit or a full general ledger.": "app.reportLimitation.18"
};

export function reportLimitationKey(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return REPORT_LIMITATION_KEYS[normalized] ?? null;
}
