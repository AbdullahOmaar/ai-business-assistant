/**
 * Normalize the decimal characters emitted by Arabic keyboards before an API write.
 * The app uses ar-EG, whose decimal separator is U+066B. Group separators are
 * intentionally not accepted: interpreting them as decimals would change values.
 */
export function normalizePurchaseDecimalInput(value: string | null | undefined): string {
  const input = String(value ?? '').trim();
  const normalizedDigits = Array.from(input, (character) => {
    const code = character.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    return character;
  }).join('');

  const normalizedDecimal = normalizedDigits.replace(/\u066b/g, '.');
  return normalizedDecimal.startsWith('.') ? `0${normalizedDecimal}` : normalizedDecimal;
}

/** Match the backend Decimal(max_digits=14, decimal_places=...) contract exactly. */
export function isValidPurchaseDecimalInput(
  value: string | null | undefined,
  maxScale: number,
  allowZero: boolean,
): boolean {
  if (!Number.isInteger(maxScale) || maxScale < 0 || maxScale > 13) return false;

  const normalized = normalizePurchaseDecimalInput(value);
  if (!normalized || normalized.length > 32) return false;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return false;

  const integer = match[1].replace(/^0+(?=\d)/, '');
  const fraction = match[2] ?? '';
  if (fraction.length > maxScale || integer.length + fraction.length > 14) return false;

  const scaled = BigInt(integer + fraction.padEnd(maxScale, '0'));
  return allowZero ? scaled >= 0n : scaled > 0n;
}
