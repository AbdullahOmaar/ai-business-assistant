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
  assert.match(moreMenu, /@for \(group of mobileMoreGroups; track group\.id\)/);
  assert.match(moreMenu, /@for \(module of group\.modules; track module\.tab\)/);
  assert.match(moreMenu, /selectMobileMoreTab\(module\.tab\)/);
  assert.match(catalogueSource, /tab: 'platform-admin', mobileGroup: 'team-admin'/);
  assert.match(moduleAccessSource, /if \(tab === 'platform-admin'\) return platformAdminAvailable;/);
  assert.match(source, /get primaryNavigationModules/);
  assert.match(source, /\['overview', 'invoices', 'customers'\]/);
  assert.match(source, /@for \(module of primaryNavigationModules; track module\.tab\)/);
  assert.match(source, /get desktopNavigationGroups/);
  assert.match(source, /@for \(group of desktopNavigationGroups; track group\.id\)/);
  assert.match(source, /setTab\(module\.tab\)/);
  assert.match(catalogueSource, /tab: 'platform-admin', mobileGroup: 'team-admin'/);

  assert.ok(
    source.includes('[class.active]="mobileMoreOpen || isMobileMoreTab(tab)"'),
    'the More active state must use the shared tested tab classifier',
  );
  assert.match(moduleAccessSource, /export function isMobileMoreTab\(tab: WorkspaceModuleTab\): boolean/);
  assert.match(moduleAccessSource, /return MOBILE_MORE_TABS\.has\(tab\)/);
});



test('mobile More keeps grouped destinations and no longer renders a sections search control', () => {
  const moreStart = source.indexOf('id="mobile-more-menu"');
  const moreEnd = source.indexOf('          <div class="sidebar-bottom"', moreStart);
  assert.ok(moreStart >= 0 && moreEnd > moreStart);
  const menu = source.slice(moreStart, moreEnd);
  assert.doesNotMatch(menu, /mobile-more-search|mobileMoreSearch|type="search"/);
  assert.match(menu, /@for \(group of mobileMoreGroups; track group\.id\)/);
  assert.match(menu, /@for \(module of group\.modules; track module\.tab\)/);
  assert.match(source, /get mobileMoreGroups\(\): readonly/);
  assert.doesNotMatch(source, /filteredMobileMoreGroups|mobileMoreSearch/);
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


test('desktop navigation groups every authorized destination and scrolls independently of the fixed shell', () => {
  assert.match(source, /<nav class="sidebar-nav-scroll"/);
  assert.match(source, /get desktopNavigationGroups/);
  assert.match(source, /const accessibleModules = this\.homeModuleCards/);
  assert.match(source, /modules: this\.primaryNavigationModules/);
  assert.match(source, /WORKSPACE_MODULE_GROUPS\.map\(group =>/);
  assert.match(source, /modules: accessibleModules\.filter\(module => module\.mobileGroup === group\.id\)/);
  assert.match(source, /\.sidebar-nav-scroll\{[^}]*min-height:0;[^}]*overflow-y:auto/s);
  assert.match(source, /overscroll-behavior:contain/);
  assert.match(source, /@media\(max-width:760px\)\{\s*\.sidebar-nav-scroll\{display:contents\}/);
  assert.match(source, /class="desktop-nav-group-label"/);
});
