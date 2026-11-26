// W-foundation — the WhatsApp linking block inside the assistant
// settings panel (Slice 4 surface): pins on the component seam
// (block, keys, load wiring, actions), the ApiService client
// surface, and ar/en parity for the new i18n block. The backend
// behaviour (codes, webhook, kill switch) is covered by
// backend/tests/test_whatsapp_channel.py.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(resolve(appDirectory, 'assistant-workspace.component.ts'), 'utf8');
const apiService = readFileSync(resolve(appDirectory, 'api.service.ts'), 'utf8');
const publicDirectory = resolve(appDirectory, '../../public/i18n');
const arabic = JSON.parse(readFileSync(resolve(publicDirectory, 'ar.json'), 'utf8'));
const english = JSON.parse(readFileSync(resolve(publicDirectory, 'en.json'), 'utf8'));

test('settings panel renders the WhatsApp linking block', () => {
  for (const key of [
    'ui.assistantWhatsapp.title',
    'ui.assistantWhatsapp.none',
    'ui.assistantWhatsapp.linkButton',
    'ui.assistantWhatsapp.codeHint',
    'ui.assistantWhatsapp.hint',
  ]) {
    assert.ok(component.includes(`t('${key}')`), `missing template key: ${key}`);
  }
  assert.ok(component.includes('assistant-whatsapp'), 'missing block class');
  assert.ok(component.includes('.assistant-whatsapp{'), 'missing block styles');
  // The one-time code is displayed after generation, and a linked
  // row offers revoke; revoked rows are labelled, not hidden.
  assert.ok(component.includes('whatsappCode'));
  assert.ok(component.includes("link.status === 'linked' ? 'ui.assistantWhatsapp.linked' : 'ui.assistantWhatsapp.revoked'"));
  assert.ok(component.includes('revokeWhatsappLink(link.id)'));
  // The panel stays phone-sized like the other Slice 4 panels.
  assert.doesNotMatch(component, /\.assistant-whatsapp\{[^}]*position:\s*fixed/);
});

test('linking actions and settings load are wired to the ApiService', () => {
  assert.ok(component.includes('createWhatsappLinkCode()'));
  assert.ok(component.includes('this.api.createWhatsappLinkCode(requestContext.workspaceId)'));
  assert.ok(component.includes('this.api.revokeWhatsappLink(requestContext.workspaceId, linkId)'));
  // The links load with the rest of the settings panel (one load).
  assert.ok(component.includes('whatsappLinks: await this.api.listWhatsappLinks(requestContext.workspaceId)'));
  assert.ok(component.includes('this.whatsappLinks = whatsappLinks'));
});

test('ApiService exposes the three linking endpoints', () => {
  assert.ok(apiService.includes('`/whatsapp/link-codes`, \'POST\', {}') || apiService.includes("}/whatsapp/link-codes`, 'POST', {}"));
  assert.ok(apiService.includes('}/whatsapp/links`)'));
  assert.ok(apiService.includes("}/whatsapp/links/${encodeURIComponent(linkId)}`, 'DELETE'"));
  assert.ok(apiService.includes('interface AssistantWhatsappLink'));
  assert.ok(apiService.includes('interface AssistantWhatsappLinkCode'));
  // The client type carries the MASKED number only.
  assert.ok(apiService.includes('phone_masked: string'));
  assert.ok(!apiService.includes('phone_e164'));
});

test('channel off renders the designed dormant state, not the link action', () => {
  // Owner rule 2026-11-26: an unlaunched feature shows a designed
  // dormant state — the settings load carries the channel flag, the
  // link action renders only when the channel is enabled, and the
  // raw backend revoke errors are mapped to handled local messages.
  assert.ok(component.includes('whatsappStatus: await this.api.getWhatsappStatus(requestContext.workspaceId)'));
  assert.ok(component.includes('this.whatsappChannelEnabled = whatsappStatus.channel_enabled'));
  assert.ok(component.includes('@if (whatsappChannelEnabled)'));
  assert.ok(component.includes("t('ui.assistantWhatsapp.comingSoon')"));
  assert.ok(component.includes("t('ui.assistantWhatsapp.linkNotFound')"));
  assert.ok(component.includes("t('ui.assistantWhatsapp.revokeForbidden')"));
  assert.ok(apiService.includes('}/whatsapp/status`)'));
  assert.ok(apiService.includes('interface AssistantWhatsappStatus'));
  assert.ok(apiService.includes('channel_enabled: boolean'));
});

test('assistantWhatsapp i18n keys are in exact ar/en parity', () => {
  const arKeys = Object.keys(arabic.ui.assistantWhatsapp).sort();
  const enKeys = Object.keys(english.ui.assistantWhatsapp).sort();
  assert.deepEqual(arKeys, enKeys);
  assert.deepEqual(arKeys, [
    'codeHint', 'comingSoon', 'hint', 'linkButton', 'linkNotFound', 'linked',
    'none', 'revokeForbidden', 'revoked', 'title',
  ]);
  for (const key of arKeys) {
    assert.ok(String(arabic.ui.assistantWhatsapp[key]).length > 0, `empty ar value: ${key}`);
    assert.ok(String(english.ui.assistantWhatsapp[key]).length > 0, `empty en value: ${key}`);
  }
});
