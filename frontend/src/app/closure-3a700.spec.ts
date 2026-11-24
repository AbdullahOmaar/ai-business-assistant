import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// 3A-700: Phase 1 closure batch 3 — the last register screens complete the
// shared system: U13 members + states, U17/U18 skeletons, U20 filter bars +
// the raw change_summary removal, U23 duplicate-submit guard. U15 and U19
// were verified conforming by evidence and are pinned as untouched here.

const invitations = readFileSync(new URL('./workspace-invitations.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const integrity = readFileSync(new URL('./integrity-workspace.component.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const admin = readFileSync(new URL('./platform-admin.component.ts', import.meta.url), 'utf8');
const notifications = readFileSync(new URL('./notifications-workspace.component.ts', import.meta.url), 'utf8');

test('3A-700 U13: the team view lists workspace members with roles beside the invitations', () => {
  assert.match(api, /businessMemberships\(businessId: string\): Promise<WorkspaceMembership\[\]>/);
  assert.match(api, /businesses\/\$\{encodeURIComponent\(businessId\)\}\/memberships/);
  assert.match(invitations, /t\('members'\)/);
  assert.match(invitations, /<bdi>\{\{ member\.user_subject \}\}<\/bdi>/);
  assert.match(invitations, /member\.role === 'owner' \? t\('owner'\) : t\('staff'\)/);
});

test('3A-700 U13: invitations show a skeleton while the first load is in flight, never the empty text', () => {
  assert.match(invitations, /@if \(loading && !invitations\.length\) \{\s*<aba-skeleton variant="list-row" \/>/);
  assert.match(invitations, /<bdi>\{\{ invitation\.email \}\}<\/bdi>/);
});

test('3A-700 U17: both integrity tables receive a loading state, including before the first report', () => {
  assert.match(integrity, /integrityLoading && !dataIntegrityReport/);
  assert.match(integrity, /\[loading\]="integrityLoading && !integrityInvoiceRows\.length"/);
  assert.match(integrity, /\[loading\]="integrityLoading && !integrityAllocationRows\.length"/);
});

test('3A-700 U18: the health tab shows skeletons during its first load', () => {
  assert.match(shell, /@if \(healthLoading && !operationalHealth\) \{ <aba-skeleton variant="list-row" \/><aba-skeleton variant="list-row" \/> \}/);
});

test('3A-700 U23: workspace creation guards against duplicate submission in flight', () => {
  assert.match(shell, /async createWorkspace\(\): Promise<void> \{\s*\/\/ 3A-700 \(U23\)[\s\S]{0,200}if \(this\.loading\) return;/);
});

test('3A-700 U20: the raw change_summary is never rendered in the platform activity log', () => {
  assert.doesNotMatch(admin, /event\.change_summary/);
  assert.match(admin, /auditActionLabel\(event\.action\)/);
  assert.match(admin, /auditTargetLabel\(event\.target_type\)/);
});

test('3A-700 U20: all three filter forms ride the shared filter bar and keep submit behaviour', () => {
  assert.equal((admin.match(/<aba-filter-bar/g) || []).length, 3);
  assert.match(admin, /\(ngSubmit\)="loadBusinesses\(0\)"/);
  assert.match(admin, /\(ngSubmit\)="loadAudit\(0\)"/);
  assert.match(admin, /\(ngSubmit\)="searchUsers\(\)"/);
  assert.match(admin, /\[filterSummary\]="businessFilterSummary"/);
  assert.match(admin, /\[filterSummary\]="auditFilterSummary"/);
  assert.match(admin, /\(clear\)="clearBusinessFilters\(\)"/);
  assert.match(admin, /\(clear\)="clearAuditFilters\(\)"/);
});

test('3A-700 U20: the three admin tables show skeletons on their first load', () => {
  assert.match(admin, /@if \(businessesLoading\) \{ @if \(businesses\.length\)/);
  assert.match(admin, /@if \(auditLoading\) \{ @if \(auditEvents\.length\)/);
  assert.match(admin, /@if \(usersLoading\) \{ @if \(users\.length\)/);
});

test('3A-700 U15: the notifications search already rides the shared pattern (verified, untouched)', () => {
  assert.match(notifications, /<aba-filter-bar/);
  assert.match(notifications, /<aba-search-field/);
});
