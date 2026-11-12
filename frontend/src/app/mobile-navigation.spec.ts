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


test('mobile More navigation provides localized search over authorized destinations', () => {
  const moreStart = source.indexOf('id="mobile-more-menu"');
  const moreEnd = source.indexOf('          <div class="sidebar-bottom"', moreStart);
  assert.ok(moreStart >= 0 && moreEnd > moreStart);
  const menu = source.slice(moreStart, moreEnd);

  assert.match(menu, /<input type="search" name="mobileMoreSearch"/);
  assert.match(menu, /\[\(ngModel\)\]="mobileMoreSearch"/);
  assert.match(menu, /\[attr\.aria-label\]="t\('البحث في الأقسام', 'Search sections'\)"/);
  assert.match(menu, /@for \(group of filteredMobileMoreGroups; track group\.id\)/);
  assert.match(menu, /mobile-more-empty" role="status"/);
  assert.match(source, /get filteredMobileMoreGroups\(\)/);
  assert.match(source, /module\.descriptionAr/);
  assert.match(source, /mobileMoreSearch = ''/);
});


test('Home module directory exposes bilingual search and a localized empty state', () => {
  const homeStart = source.indexOf('class="module-directory-disclosure"');
  const homeEnd = source.indexOf("@if (tab === 'notifications')", homeStart);
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  const home = source.slice(homeStart, homeEnd);

  assert.match(home, /name="homeModuleSearch"/);
  assert.match(home, /\[\(ngModel\)\]="homeModuleSearch"/);
  assert.match(home, /get filteredHomeModuleCards/);
  assert.match(home, /@for \(module of filteredHomeModuleCards; track module\.tab\)/);
  assert.match(home, /module-directory-empty" role="status"/);
  assert.match(source, /filterWorkspaceModules\(this\.homeModuleCards, this\.homeModuleSearch/);
});


test('mobile More search resets on close and restores keyboard focus', () => {
  const toggleStart = source.indexOf('toggleMobileMore(): void {');
  const escapeStart = source.indexOf('closeMobileMoreOnEscape(): void {');
  const selectStart = source.indexOf('selectMobileMoreTab(tab: Tab): void {');
  const outsideStart = source.indexOf('closeMobileMoreOnOutsidePointer(event: PointerEvent): void {');
  const outsideEnd = source.indexOf('async installApp(): Promise<void>', outsideStart);
  assert.ok(toggleStart >= 0 && escapeStart > toggleStart && selectStart > escapeStart && outsideStart > selectStart && outsideEnd > outsideStart);

  const toggle = source.slice(toggleStart, escapeStart);
  const escape = source.slice(escapeStart, selectStart);
  const select = source.slice(selectStart, outsideStart);
  const outside = source.slice(outsideStart, outsideEnd);

  assert.match(toggle, /if \(this\.mobileMoreOpen\) this\.mobileMoreSearch = ''/);
  assert.match(escape, /this\.mobileMoreOpen = false;[\s\S]*this\.mobileMoreSearch = '';[\s\S]*this\.mobileMoreTrigger\?\.nativeElement\.focus\(\)/);
  assert.match(select, /this\.mobileMoreSearch = '';[\s\S]*this\.setTab\(tab\);[\s\S]*this\.mobileMoreTrigger\?\.nativeElement\.focus\(\)/);
  assert.match(outside, /this\.mobileMoreOpen = false;[\s\S]*this\.mobileMoreSearch = ''/);
});
