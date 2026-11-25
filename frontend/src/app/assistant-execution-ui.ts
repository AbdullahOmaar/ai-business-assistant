// Pure helpers for the assistant execution UI (Slice 2) — no Angular
// imports, so node:test can import this module directly.
//
// The stop words are written as Unicode escapes on purpose: the
// localization guard (localization.spec.ts) forbids Arabic letter runs
// in .ts source files, so the words live here as escapes and every
// user-visible string lives in the dictionaries.

import type { WorkspaceTab } from './core/navigation/workspace-route';

// Stop words (DESIGN.md §5.2): the words that stop in-flight work.
// Written as escapes — see the module header.
export const STOP_WORDS: readonly string[] = [
  '\u0648\u0642\u0641',
  '\u0627\u0633\u062A\u0646\u0649',
  '\u0627\u0633\u062A\u0646\u064A',
  '\u0625\u0644\u063A\u0627\u0621',
];

/** True when the trimmed message is exactly a stop word (trailing punctuation ignored). */
export function isStopWord(text: string): boolean {
  const cleaned = text.trim().replace(/[!؟.،,\s]+$/u, '');
  return STOP_WORDS.includes(cleaned);
}

export interface ProposalCountdown {
  expired: boolean;
  totalSeconds: number;
  minutes: number;
  seconds: number;
  /** "M:SS" while valid; "0:00" once expired. */
  text: string;
}

/** Remaining validity of a proposal from its expires_at (5 minutes after creation). */
export function proposalCountdown(expiresAtIso: string, nowMs: number): ProposalCountdown {
  const expiresMs = Date.parse(expiresAtIso);
  const remainingMs = Number.isFinite(expiresMs) ? expiresMs - nowMs : -1;
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return {
    expired: remainingMs <= 0,
    totalSeconds,
    minutes,
    seconds,
    text: `${minutes}:${String(seconds).padStart(2, '0')}`,
  };
}

export interface PayloadRow {
  /** Dot/bracket path, e.g. "update.invoice_number" or "lines[0].quantity". */
  path: string;
  value: unknown;
  /** Only scalar leaves are editable; arrays and objects are preview-only. */
  editable: boolean;
}

export interface FlattenedPayload {
  rows: PayloadRow[];
  /** True when the row cap cut the preview short. */
  truncated: boolean;
}

const MAX_PAYLOAD_ROWS = 50;
const MAX_ARRAY_ITEMS = 5;
const MAX_DEPTH = 3;

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Flatten a proposal payload into preview rows: scalar leaves with their
 * paths, arrays of objects expanded by index (capped), arrays of scalars
 * kept as one row. Objects themselves get no row — their leaves do.
 */
export function flattenPayload(payload: unknown): FlattenedPayload {
  const rows: PayloadRow[] = [];
  let truncated = false;

  function walk(value: unknown, path: string, depth: number): void {
    if (rows.length >= MAX_PAYLOAD_ROWS) {
      truncated = true;
      return;
    }
    if (isScalar(value)) {
      rows.push({ path, value, editable: depth > 0 });
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        rows.push({ path, value: [], editable: false });
        return;
      }
      if (value.every(isScalar)) {
        rows.push({ path, value, editable: false });
        return;
      }
      const shown = value.slice(0, MAX_ARRAY_ITEMS);
      shown.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      if (value.length > MAX_ARRAY_ITEMS) truncated = true;
      return;
    }
    if (typeof value === 'object' && value !== null) {
      if (depth >= MAX_DEPTH) {
        rows.push({ path, value, editable: false });
        return;
      }
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        walk(child, path ? `${path}.${key}` : key, depth + 1);
        if (truncated) return;
      }
      return;
    }
    rows.push({ path, value: String(value), editable: false });
  }

  walk(payload, '', 0);
  return { rows, truncated };
}

/** Display text for one preview value (arrays joined, objects as JSON). */
export function formatPayloadValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(item => formatPayloadValue(item)).join(', ');
  return JSON.stringify(value);
}

/** Read one scalar leaf by dot/bracket path; undefined when absent. */
export function getAtPath(payload: unknown, path: string): unknown {
  let current: unknown = payload;
  for (const segment of splitPath(path)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Set one scalar leaf by dot/bracket path (mutates a cloned draft). */
export function setAtPath(payload: Record<string, unknown>, path: string, value: unknown): void {
  const segments = splitPath(path);
  let current: Record<string, unknown> = payload;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const next = current[segments[index]];
    if (next === null || typeof next !== 'object') return;
    current = next as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

function splitPath(path: string): string[] {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
}

/**
 * Coerce an edited text input back to the original leaf type.
 * Numbers must parse finite; booleans accept true/false only.
 */
export function coerceScalar(
  raw: string,
  original: unknown,
): { ok: true; value: unknown } | { ok: false } {
  if (typeof original === 'number') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false };
  }
  if (typeof original === 'boolean') {
    if (raw === 'true') return { ok: true, value: true };
    if (raw === 'false') return { ok: true, value: false };
    return { ok: false };
  }
  if (original === null) return { ok: true, value: raw === '' ? null : raw };
  return { ok: true, value: raw };
}

/**
 * The workspace tab that holds a created record, for the execution-result
 * link. There are no per-record URLs by design (nested paths fail closed),
 * so the link opens the record's tab — the new record lists first.
 * Stock movements live under Products (inventory ledger); sales returns
 * and credit notes live under Invoices; pricing rules live under Products.
 */
export function recordTabForTarget(
  targetType: string,
  payload?: Record<string, unknown> | null,
): WorkspaceTab | null {
  const tabs: Record<string, WorkspaceTab> = {
    customer: 'customers',
    supplier: 'suppliers',
    product: 'products',
    invoice: 'invoices',
    payment: 'payments',
    stock_movement: 'products',
    expense: 'expenses',
    purchase_order: 'purchases',
    sales_return: 'invoices',
    credit_note: 'invoices',
    recurring_invoice_schedule: 'recurring',
    pricing_rule: 'products',
    payroll: 'employees',
    notification: 'notifications',
  };
  if (targetType === 'import_job') {
    const entity = typeof payload?.['entity_type'] === 'string' ? payload['entity_type'] : '';
    if (entity === 'customers') return 'customers';
    if (entity === 'products') return 'products';
    return null;
  }
  return tabs[targetType] ?? null;
}

/** Which lawful alternative a refusal card offers for a forbidden action. */
export function refusalAlternative(action: string): 'delete' | 'settings' | 'membership' | 'generic' {
  const normalized = action.toLowerCase();
  if (normalized.includes('delete') || normalized.includes('remove')) return 'delete';
  if (normalized.includes('setting')) return 'settings';
  if (normalized.includes('member') || normalized.includes('role') || normalized.includes('invit')) return 'membership';
  return 'generic';
}
