import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const componentSource = readFileSync(new URL('./shared/ui/aba-icon.component.ts', import.meta.url), 'utf8');
const searchFieldSource = readFileSync(new URL('./shared/ui/aba-search-field.component.ts', import.meta.url), 'utf8');
const appSource = expandTranslationCalls(readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8'));
const catalogSource = readFileSync(new URL('./workspace-module-catalog.ts', import.meta.url), 'utf8');

// T18 Slice D: shared inline SVG icons for the new shared pieces (search,
// filter, clear, add, export, import). The component is exercised by source
// assertions (no TestBed in the node runner), following the
// aba-skeleton.spec.ts pattern. The spec lives flat in src/app/ like the
// other specs: `npm test` globs src/app/*.spec.ts, so a spec under
// shared/ui/ would never run.
//
// T18 Slice G (2026-11-21) deliberately extended the set to ten icons:
// `check`, `close`, `chevron-left`, `chevron-right` for the redrawn
// customer-statement card (owner ruling 2026-11-21 15:07 EET: every card
// action has an icon). The six-icon assertions below were updated, not
// loosened: the union, the SVG count and the distinct-path checks now cover
// all ten.
//
// T18 Slice U02 (2026-11-21) deliberately extended the set to thirteen:
// `document`, `statement`, `edit` for the customer directory / profile card
// actions (same owner ruling). The ten-icon assertions below were updated,
// not loosened: the union, the SVG count and the distinct-path checks now
// cover all thirteen.

// --- Component contract ---

test('icon is a standalone OnPush component with a name input covering the thirteen shared icons', () => {
  assert.ok(componentSource.includes("selector: 'aba-icon'"), 'missing selector');
  assert.ok(componentSource.includes('standalone: true'));
  assert.ok(componentSource.includes('ChangeDetectionStrategy.OnPush'));
  assert.match(componentSource, /export type AbaIconName = 'search' \| 'filter' \| 'clear' \| 'add' \| 'export' \| 'import' \| 'check' \| 'close' \| 'chevron-left' \| 'chevron-right' \| 'document' \| 'statement' \| 'edit';/);
  assert.match(componentSource, /readonly name = input<AbaIconName>\('search'\)/);
});

test('all thirteen icons are inline SVG: decorative, currentColor, no icon library, font or external asset', () => {
  assert.equal((componentSource.match(/<svg /g) ?? []).length, 13, 'one inline SVG per icon name');
  for (const svg of componentSource.match(/<svg[^>]*>/g) ?? []) {
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /stroke="currentColor"/);
    assert.match(svg, /stroke-width="1\.8"/);
  }
  assert.doesNotMatch(componentSource, /font-family|@font-face|<img|url\(|https?:\/\//,
    'icons must be inline SVG, not a font, image or remote asset');
  assert.doesNotMatch(componentSource, /AIPA/, 'no provisional brand name ships in the icon set');
});

test('search icon keeps the exact invoice magnifier geometry it was extracted from', () => {
  const searchStart = componentSource.indexOf("name() === 'search'");
  assert.ok(searchStart >= 0, 'missing search branch');
  const search = componentSource.slice(searchStart, componentSource.indexOf("} @else if (name() === 'filter')", searchStart));
  assert.match(search, /<circle cx="10\.8" cy="10\.8" r="6\.8"\/>/);
  assert.match(search, /<path d="m16 16 5 5"\/>/);
});

test('each remaining icon has its own distinct outline path', () => {
  assert.ok(componentSource.includes('<path d="M4 5h16l-6 7.5v5l-4 2.5v-7.5L4 5z"/>'), 'filter funnel missing');
  assert.ok(componentSource.includes('<path d="M6 6l12 12M18 6L6 18"/>'), 'clear cross missing');
  assert.ok(componentSource.includes('<path d="M12 5v14M5 12h14"/>'), 'add plus missing');
  assert.ok(componentSource.includes('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/>'), 'export arrow missing');
  assert.ok(componentSource.includes('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/>'), 'import arrow missing');
  assert.equal((componentSource.match(/<path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"\/>/g) ?? []).length, 2,
    'export and import share the tray outline, with opposite arrows');
  // T18 Slice G (2026-11-21): the four statement-card icons.
  assert.ok(componentSource.includes('<path d="M5 12.5l4.5 4.5L19 7.5"/>'), 'check tick missing');
  assert.ok(componentSource.includes('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'), 'close circled X missing');
  assert.ok(componentSource.includes('<path d="M14.5 6l-6 6 6 6"/>'), 'chevron-left missing');
  assert.ok(componentSource.includes('<path d="M9.5 6l6 6-6 6"/>'), 'chevron-right missing');
  // T18 Slice U02 (2026-11-21): the three customer card-action icons.
  assert.ok(componentSource.includes('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>'), 'document page missing');
  assert.ok(componentSource.includes('<path d="M4 5h16v14H4z"/><path d="M4 10h16M9.5 10v9M14.5 10v9"/>'), 'statement table missing');
  assert.ok(componentSource.includes('<path d="M17 3l4 4L8 20l-5 1 1-5L17 3z"/><path d="M4 16l4 4"/>'), 'edit pencil missing');
});

// --- Invoice search extraction ---

// T18 Slice E (2026-11-21): the invoice search is aba-search-field now, so
// the shell imports the search field and the search field owns the shared
// search icon. The inline magnifier copy stays gone, and the invoice search
// input itself is the component's type="search" input.
test('invoice search uses the shared search icon and the inline magnifier copy is gone', () => {
  assert.ok(appSource.includes("import { AbaSearchFieldComponent } from './shared/ui/aba-search-field.component';"),
    'shell must import the search field component');
  assert.ok(appSource.includes('AbaSearchFieldComponent, AbaIconComponent, AbaMobileAppHeaderComponent'),
    'shell must list the search field component in its imports (Slice G 2026-11-21: the icon component was added after it for the statement-card buttons)');
  assert.ok(appSource.includes('<aba-search-field class="invoice-search" name="invoiceSearch"'),
    'invoice search must render the shared search field with the existing hook class');
  assert.ok(searchFieldSource.includes("import { AbaIconComponent } from './aba-icon.component';"),
    'the search field must import the icon component');
  assert.ok(searchFieldSource.includes('<aba-icon name="search" class="aba-search-field__icon" />'),
    'the search field must render the shared search icon');
  assert.doesNotMatch(appSource, /<svg class="invoice-search-icon"/,
    'the duplicated inline magnifier must not remain in the invoice search');
  assert.doesNotMatch(appSource, /<aba-icon name="search"/,
    'the shell no longer renders a bare search icon: the component owns it');
  assert.ok(searchFieldSource.includes('type="search"'),
    'the search field itself renders the type="search" input');
});

// --- What this slice deliberately does NOT change ---

test('catalog and nav Unicode glyphs stay: replacing them with SVG icons is a later slice, not this one', () => {
  assert.ok(catalogSource.includes("icon: '⌂'"), 'overview glyph must stay');
  assert.ok(catalogSource.includes("icon: '▤'"), 'invoices glyph must stay');
  assert.ok(catalogSource.includes("icon: '◇'"), 'products glyph must stay');
  assert.doesNotMatch(appSource, /<aba-icon name="(overview|invoices|customers|products)"/,
    'no catalog/nav glyph is replaced by an icon component in this slice');
});
