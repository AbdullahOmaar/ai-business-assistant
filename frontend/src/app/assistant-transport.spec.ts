// 3A-920 (transport/delivery foundation) — the master switch +
// unit name inside the assistant settings panel (the app's only
// settings surface; no new tab, no new screen): pins on the
// component seam (block, keys, load wiring, actions), the shared
// settings endpoints, and ar/en parity for the new i18n block. The
// backend read contract (default OFF, unit-name default/fallback,
// tenant isolation) is covered by
// backend/tests/test_transport_settings.py.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(resolve(appDirectory, 'assistant-workspace.component.ts'), 'utf8');
const persistence = readFileSync(resolve(appDirectory, 'assistant-persistence.ts'), 'utf8');
const apiService = readFileSync(resolve(appDirectory, 'api.service.ts'), 'utf8');
const backend = readFileSync(resolve(appDirectory, '../../../backend/app/transport_settings.py'), 'utf8');
const publicDirectory = resolve(appDirectory, '../../public/i18n');
const arabic = JSON.parse(readFileSync(resolve(publicDirectory, 'ar.json'), 'utf8'));
const english = JSON.parse(readFileSync(resolve(publicDirectory, 'en.json'), 'utf8'));

test('settings panel renders the transport section (owner-only)', () => {
  for (const key of [
    'ui.assistantSettings.transport.title',
    'ui.assistantSettings.transport.enable',
    'ui.assistantSettings.transport.enableHint',
    'ui.assistantSettings.transport.unitName',
    'ui.assistantSettings.transport.unitNameHint',
    'ui.assistantSettings.transport.defaultUnitName',
  ]) {
    assert.ok(component.includes(`t('${key}')`), `missing template key: ${key}`);
  }
  assert.ok(component.includes('assistant-transport'), 'missing block class');
  assert.ok(component.includes('.assistant-transport{'), 'missing block styles');
  assert.ok(component.includes('toggleTransport($any($event.target).checked)'));
  assert.ok(component.includes('changeTransportUnitName($any($event.target).value)'));
  // Both controls are owner-only, like the dialect + brief toggles.
  assert.ok(component.includes('(change)="toggleTransport($any($event.target).checked)" [disabled]="!isOwner"'));
  assert.ok(component.includes('(change)="changeTransportUnitName($any($event.target).value)" [disabled]="!isOwner"'));
  // The unit-name field renders only while the switch is on — OFF is
  // zero effect: the pieces are not rendered at all, not a "coming
  // soon" state.
  assert.ok(component.includes('@if (transportEnabled)'));
  // The panel stays phone-sized like the other Slice 4 panels.
  assert.doesNotMatch(component, /\.assistant-transport\{[^}]*position:\s*fixed/);
});

test('transport load defaults OFF and derives the unit name', () => {
  // The switch loads with the rest of the settings panel (one load);
  // only an explicit "true" enables it — absence means off.
  assert.ok(component.includes("settingsValue(settings, TRANSPORT_ENABLED_SETTING_KEY, 'false')"));
  assert.ok(component.includes(".trim().toLowerCase() === 'true'"));
  assert.ok(component.includes('this.transportEnabled = '));
  // A stored unit name is used; a blank one falls back to the
  // catalog default (no user-visible copy in source).
  assert.ok(component.includes("settingsValue(settings, TRANSPORT_UNIT_NAME_SETTING_KEY, '')"));
  assert.ok(component.includes("this.t('ui.assistantSettings.transport.defaultUnitName')"));
  assert.ok(!persistence.includes('توصيلة'), 'Arabic default must live in the i18n catalog, not in source');
});

test('transport actions use the existing owner-only settings endpoints', () => {
  assert.ok(component.includes('TRANSPORT_ENABLED_SETTING_KEY, checked ? \'true\' : \'false\''));
  assert.ok(component.includes('TRANSPORT_UNIT_NAME_SETTING_KEY, next'));
  // A blank unit name deletes the stored row (read falls back to
  // the default) instead of writing an empty value.
  assert.ok(component.includes('this.api.deleteSetting(requestContext.workspaceId, TRANSPORT_UNIT_NAME_SETTING_KEY)'));
  assert.ok(apiService.includes('updateSetting(businessId: string, key: string, value: string)'));
  assert.ok(apiService.includes('deleteSetting(businessId: string, key: string)'));
});

test('frontend and backend agree on the transport keys and defaults', () => {
  assert.ok(persistence.includes("TRANSPORT_ENABLED_SETTING_KEY = 'transport.enabled'"));
  assert.ok(persistence.includes("TRANSPORT_UNIT_NAME_SETTING_KEY = 'transport.unit_name'"));
  assert.ok(backend.includes('TRANSPORT_ENABLED_KEY = "transport.enabled"'));
  assert.ok(backend.includes('TRANSPORT_UNIT_NAME_KEY = "transport.unit_name"'));
  assert.ok(backend.includes('DEFAULT_TRANSPORT_UNIT_NAME = "توصيلة"'));
  assert.ok(persistence.includes('MAX_TRANSPORT_UNIT_NAME_LENGTH = 40'));
  assert.ok(backend.includes('MAX_TRANSPORT_UNIT_NAME_LENGTH = 40'));
});

test('assistantSettings.transport i18n keys are in exact ar/en parity', () => {
  const arKeys = Object.keys(arabic.ui.assistantSettings.transport).sort();
  const enKeys = Object.keys(english.ui.assistantSettings.transport).sort();
  assert.deepEqual(arKeys, enKeys);
  for (const key of arKeys) {
    assert.ok(typeof arabic.ui.assistantSettings.transport[key] === 'string' && arabic.ui.assistantSettings.transport[key].length > 0, `empty ar key: ${key}`);
    assert.ok(typeof english.ui.assistantSettings.transport[key] === 'string' && english.ui.assistantSettings.transport[key].length > 0, `empty en key: ${key}`);
  }
  // No trade-specific name anywhere in the UI copy: the capability
  // is general transport/delivery (owner amendment 1, 3A-920).
  const copy = JSON.stringify(arabic.ui.assistantSettings.transport) + JSON.stringify(english.ui.assistantSettings.transport);
  assert.ok(!copy.includes('شونة') && !copy.includes('Shouna') && !copy.includes('Elshona'));
});
