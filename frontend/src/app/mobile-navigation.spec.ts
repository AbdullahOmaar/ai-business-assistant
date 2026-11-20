import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandDictionaryBackedProperties, expandTranslationCalls } from './localization-test-helpers.ts';

const source = expandTranslationCalls(
  readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8')
  + '\n'
  + readFileSync(new URL('./app.component.css', import.meta.url), 'utf8')
);
const moduleAccessSource = readFileSync(new URL('./module-access.ts', import.meta.url), 'utf8');
const catalogueSource = expandDictionaryBackedProperties(readFileSync(new URL('./workspace-module-catalog.ts', import.meta.url), 'utf8'));

test('mobile bottom navigation keeps four slots and places platform admin in More', () => {
  const mobileSidebarStart = source.indexOf('.sidebar{position:fixed;inset:auto 0 0;width:100%');
  const mobileItemsStart = source.indexOf('.nav-item{', mobileSidebarStart);
  assert.ok(mobileSidebarStart >= 0 && mobileItemsStart > mobileSidebarStart);

  const mobileSidebarStyles = source.slice(mobileSidebarStart, mobileItemsStart);
  assert.match(mobileSidebarStyles, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(source, /class="mobile-dock-items"/);
  assert.match(source, /\.mobile-dock-items\{display:contents\}/);
  assert.match(source, /\.desktop-sidebar-groups\{display:none\}/);
  assert.match(source, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);

  const moreStart = source.indexOf('id="mobile-more-menu"');
  const moreEnd = source.indexOf('          <div class="sidebar-bottom"', moreStart);
  assert.ok(moreStart >= 0 && moreEnd > moreStart);
  const moreMenu = source.slice(moreStart, moreEnd);
  assert.match(moreMenu, /@for \(group of filteredMobileMoreGroups; track group\.id\)/);
  assert.match(moreMenu, /@for \(module of group\.modules; track module\.tab\)/);
  assert.match(moreMenu, /selectMobileMoreTab\(module\.tab\)/);
  assert.match(catalogueSource, /tab: 'platform-admin', mobileGroup: 'team-admin'/);
  assert.match(moduleAccessSource, /if \(tab === 'platform-admin'\) return platformAdminAvailable;/);
  assert.match(source, /get primaryNavigationModules/);
  assert.match(source, /\['overview', 'invoices', 'customers'\]/);
  assert.match(source, /@for \(module of primaryNavigationModules; track module\.tab\)/);
  assert.match(source, /get primaryNavigationModules/);
  assert.match(source, /\['overview', 'invoices', 'customers'\]/);
  assert.match(source, /@for \(module of primaryNavigationModules; track module\.tab\)/);
  assert.match(source, /setTab\('platform-admin'\)/);
  assert.match(source, /@if \(canAccessTab\('platform-admin'\)\)/);
  assert.match(source, /@if \(canAccessTab\('employees'\)\)/);
  assert.match(catalogueSource, /tab: 'platform-admin', mobileGroup: 'team-admin'/);

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
  assert.match(source, /module\.descriptionKey/);
  assert.match(source, /mobileMoreSearch = ''/);
});


test('Home module directory exposes bilingual search and a localized empty state', () => {
  const homeStart = source.indexOf('class="module-directory-disclosure"');
  const homeEnd = source.indexOf("@if (tab === 'notifications')", homeStart);
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  const home = source.slice(homeStart, homeEnd);

  assert.match(home, /name="homeModuleSearch"/);
  assert.match(home, /\[\(ngModel\)\]="homeModuleSearch"/);
  assert.match(source, /get filteredHomeModuleCards/);
  assert.match(home, /@for \(module of filteredHomeModuleCards; track module\.tab\)/);
  assert.match(home, /module-directory-empty" role="status"/);
  assert.match(source, /filterWorkspaceModules\(\s*this\.homeModuleCards,\s*this\.homeModuleSearch/);
});


test('desktop navigation groups every catalogue destination and scrolls independently of the fixed shell', () => {
  assert.match(source, /<div class="sidebar-nav-scroll">/);
  assert.match(source, /class="desktop-sidebar-groups"/);
  assert.match(source, /class="desktop-nav-group"/);
  for (const tab of ['overview', 'invoices', 'customers', 'products', 'suppliers', 'purchases', 'reports', 'taxes', 'payments', 'expenses', 'recurring', 'employees', 'team', 'platform-admin', 'audit', 'integrity', 'notifications', 'health', 'assistant', 'release-guide']) {
    assert.ok(source.includes("setTab('" + tab + "')"), 'desktop navigation must retain ' + tab);
  }
  for (const key of ['catalog.m_1341u8e', 'catalog.m_2h49lq', 'catalog.m_8ogsj9', 'catalog.m_lkukj5', 'catalog.m_18paotq']) {
    assert.ok(source.includes(key), 'desktop navigation must mirror More group ' + key);
  }
  assert.match(source, /@if \(canAccessTab\('integrity'\)\)/);
  assert.match(source, /\.sidebar-nav-scroll\{[^}]*min-height:0;[^}]*overflow-y:auto/s);
  assert.match(source, /overscroll-behavior:contain/);
  assert.match(source, /@media\(max-width:760px\)\{\s*\.sidebar-nav-scroll\{display:contents\}/);
  assert.match(source, /class="desktop-nav-group-label"/);
});
