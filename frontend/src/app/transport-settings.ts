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

/** Only an explicit "true" enables transport — absence means off. */
export function transportEnabledFromSettings(settings: readonly BusinessSettingItem[]): boolean {
  return settingsValue([...settings], TRANSPORT_ENABLED_SETTING_KEY, 'false').trim().toLowerCase() === 'true';
}

/** The company's own stored unit name, or the catalog default. */
export function transportUnitNameFromSettings(settings: readonly BusinessSettingItem[], defaultUnitName: string): string {
  const stored = settingsValue([...settings], TRANSPORT_UNIT_NAME_SETTING_KEY, '').trim().slice(0, MAX_TRANSPORT_UNIT_NAME_LENGTH);
  return stored || defaultUnitName;
}
