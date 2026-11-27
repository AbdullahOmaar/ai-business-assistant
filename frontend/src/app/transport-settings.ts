// 3A-920 — shared transport/delivery settings (the per-business
// master switch + transport unit name). The keys are the same
// BusinessSetting rows the backend reads in app.transport_settings —
// DEFAULT OFF. The display default for the unit name lives in the
// i18n catalog (ui.assistantSettings.transport.defaultUnitName) — no
// user-visible copy may live in source (localization guard).
//
// Every surface that shows a transport piece (settings panel, employee
// card + list, invoice editor, product editor, payroll) reads the flag
// through these helpers so the switch stays one decision: OFF means
// the pieces are not rendered at all.
import type { BusinessSettingItem } from './api.service';
import { settingsValue } from './assistant-persistence';

export const TRANSPORT_ENABLED_SETTING_KEY = 'transport.enabled';
export const TRANSPORT_UNIT_NAME_SETTING_KEY = 'transport.unit_name';
export const MAX_TRANSPORT_UNIT_NAME_LENGTH = 40;

// Daily-wage divisor (3A-920 step 2, manager ruling 2026-11-27):
// daily pay = monthly salary / divisor. The divisor is the company's
// own setting (default 30), read by the backend at payroll creation;
// this helper mirrors the same contract for the settings panel and
// the payroll form's rate hint.
export const DAILY_DIVISOR_SETTING_KEY = 'payroll.daily_divisor';
export const DEFAULT_DAILY_DIVISOR = 30;
export const MIN_DAILY_DIVISOR = 1;
export const MAX_DAILY_DIVISOR = 31;

/** Only an explicit "true" enables transport — absence means off. */
export function transportEnabledFromSettings(settings: readonly BusinessSettingItem[]): boolean {
  return settingsValue([...settings], TRANSPORT_ENABLED_SETTING_KEY, 'false').trim().toLowerCase() === 'true';
}

/** The company's own stored unit name, or the catalog default. */
export function transportUnitNameFromSettings(settings: readonly BusinessSettingItem[], defaultUnitName: string): string {
  const stored = settingsValue([...settings], TRANSPORT_UNIT_NAME_SETTING_KEY, '').trim().slice(0, MAX_TRANSPORT_UNIT_NAME_LENGTH);
  return stored || defaultUnitName;
}

/** The company's daily-wage divisor, or 30 when unset/invalid —
 *  the same fallback the backend applies, so the hint never lies. */
export function dailyDivisorFromSettings(settings: readonly BusinessSettingItem[]): number {
  const parsed = Number.parseInt(settingsValue([...settings], DAILY_DIVISOR_SETTING_KEY, '').trim(), 10);
  return Number.isInteger(parsed) && parsed >= MIN_DAILY_DIVISOR && parsed <= MAX_DAILY_DIVISOR
    ? parsed
    : DEFAULT_DAILY_DIVISOR;
}
