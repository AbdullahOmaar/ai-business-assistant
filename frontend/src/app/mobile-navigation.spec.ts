import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

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
  assert.match(moreMenu, /@if \(platformAdminAvailable\)/);
  assert.match(moreMenu, /setTab\('platform-admin'\)/);
  assert.match(moreMenu, /Platform admin/);
  assert.match(
    source,
    /class="nav-item platform-admin-nav".{0,500}setTab\('platform-admin'\)/s,
    'the existing desktop Platform Admin destination must remain available',
  );
  assert.match(
    source,
    /\['products','payments','expenses','employees','assistant','reports','audit','platform-admin'\]\.includes\(tab\)/,
    'More must stay active when a hidden destination is open',
  );
});
