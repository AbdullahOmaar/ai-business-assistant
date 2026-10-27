/** CSV serialization helpers for user-controlled business data. */
export function escapeCsvCell(value: unknown): string {
  let text = String(value ?? '');
  // Prevent spreadsheet formula execution, including cells with leading whitespace/control characters.
  if (/^[\s\u0000-\u001F]*[=+\-@]/.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function buildCsv(
  headers: readonly unknown[],
  rows: readonly (readonly unknown[])[],
): string {
  return '\uFEFF' + [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}
