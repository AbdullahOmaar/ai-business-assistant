/** CSV serialization helpers for user-controlled business data. */

/**
 * Detects a spreadsheet formula trigger after leading whitespace/control
 * characters in the shared CSV path: Unicode whitespace plus C0 controls.
 */
export const CSV_FORMULA_TRIGGER = /^[\s\u0000-\u001F]*[=+\-@]/;
/**
 * ASCII-only variant used by the receivables-aging export. It covers the
 * same C0 controls plus space (0x20) but no other Unicode whitespace, so
 * that export keeps its exact historical output.
 */
export const CSV_FORMULA_TRIGGER_ASCII = /^[\u0000-\u0020]*[=+\-@]/;

/**
 * Prefixes a value with a single quote when it would be interpreted as a
 * spreadsheet formula after leading whitespace/control characters.
 * The default trigger is the shared (Unicode-whitespace) one; pass
 * CSV_FORMULA_TRIGGER_ASCII to preserve the aging export's ASCII-only
 * behaviour.
 */
export function escapeCsvFormulaPrefix(value: string, trigger: RegExp = CSV_FORMULA_TRIGGER): string {
  return trigger.test(value) ? "'" + value : value;
}

export function escapeCsvCell(value: unknown): string {
  let text = String(value ?? '');
  // Prevent spreadsheet formula execution, including cells with leading whitespace/control characters.
  text = escapeCsvFormulaPrefix(text);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function buildCsv(
  headers: readonly unknown[],
  rows: readonly (readonly unknown[])[],
): string {
  return '\uFEFF' + [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}
