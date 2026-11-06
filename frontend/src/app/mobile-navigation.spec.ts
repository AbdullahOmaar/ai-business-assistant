import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const moduleAccessSource = readFileSync(new URL('./module-access.ts', import.meta.url), 'utf8');
const catalogueSource = readFileSync(new URL('./workspace-module-catalog.ts', import.meta.url), 'utf8');

test('mobile bottom navigation keeps four slots and places platform admin in More', () => {
  const mobileSidebarStart = source.indexOf('.sidebar{position:fixed;inset:auto 0 0;width:100%');
  const mobileItemsStart = source.indexOf('.nav-item{', mobileSidebarStart);
  assert.ok(mobileSidebarStart >= 0 && mobileItemsStart > mobileSidebarStart);

  const mobileSidebarStyles = source.slice(mobileSidebarStart, mobileItemsStart);
  assert.match(mobileSidebarStyles, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(
    source,
    /\.sidebar>\.mobile-extra,\.sidebar>\.platform-admin-nav\{display:none\}/,
    'non-primary sections, including the desktop admin link, must not create a fifth mobile slot',
  );

  const moreStart = source.indexOf('id="mobile-more-menu"');
  const moreEnd = source.indexOf('          <div class="sidebar-bottom"', moreStart);
  assert.ok(moreStart >= 0 && moreEnd > moreStart);
  const moreMenu = source.slice(moreStart, moreEnd);
  assert.match(moreMenu, /@for \(group of mobileMoreGroups; track group\.id\)/);
  assert.match(moreMenu, /@for \(module of group\.modules; track module\.tab\)/);
  assert.match(moreMenu, /selectMobileMoreTab\(module\.tab\)/);
  assert.match(catalogueSource, /tab: 'platform-admin', mobileGroup: 'team-admin'/);
  assert.match(moduleAccessSource, /if \(tab === 'platform-admin'\) return platformAdminAvailable;/);
  assert.match(
    source,
    /class="nav-item platform-admin-nav".{0,500}setTab\('platform-admin'\)/s,
    'the existing desktop Platform Admin destination must remain available',
  );

  assert.ok(
    source.includes('[class.active]="mobileMoreOpen || isMobileMoreTab(tab)"'),
    'the More active state must use the shared tested tab classifier',
  );
  assert.match(moduleAccessSource, /export function isMobileMoreTab\(tab: WorkspaceModuleTab\): boolean/);
  assert.match(moduleAccessSource, /return MOBILE_MORE_TABS\.has\(tab\)/);
});
