import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURE_CATALOG, RELEASE_HISTORY } from './release-guide.ts';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../../..');
const frontendRoot = existsSync(resolve(repositoryRoot, 'frontend/package.json'))
  ? resolve(repositoryRoot, 'frontend')
  : resolve(testDirectory, '../..');
const hasBackendPackage = existsSync(resolve(repositoryRoot, 'backend/pyproject.toml'));
const frontendPackage = JSON.parse(readFileSync(resolve(frontendRoot, 'package.json'), 'utf8'));
const buildInfo = readFileSync(resolve(frontendRoot, 'src/app/build-info.ts'), 'utf8');
const serviceWorker = readFileSync(resolve(frontendRoot, 'public/sw.js'), 'utf8');

test('feature catalogue has unique sections and bilingual user-facing content', () => {
  const ids = FEATURE_CATALOG.map((section) => section.id);

  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);

  for (const section of FEATURE_CATALOG) {
    assert.ok(section.titleAr.trim(), `Arabic section title missing: ${section.id}`);
    assert.ok(section.titleEn.trim(), `English section title missing: ${section.id}`);
    assert.ok(section.noteAr.trim(), `Arabic section note missing: ${section.id}`);
    assert.ok(section.noteEn.trim(), `English section note missing: ${section.id}`);
    assert.ok(section.features.length > 0, `Section has no features: ${section.id}`);

    for (const feature of section.features) {
      assert.ok(feature.titleAr.trim(), `Arabic feature title missing: ${section.id}`);
      assert.ok(feature.titleEn.trim(), `English feature title missing: ${section.id}`);
      assert.ok(feature.detailAr.trim(), `Arabic feature detail missing: ${section.id}`);
      assert.ok(feature.detailEn.trim(), `English feature detail missing: ${section.id}`);
    }
  }
});

test('release history has unique semantic versions in newest-first order', () => {
  const versions = RELEASE_HISTORY.map((release) => release.version);
  const parse = (version: string) => {
    assert.match(version, /^\d+\.\d+\.\d+$/, `Invalid semantic version: ${version}`);
    return version.split('.').map(Number);
  };

  assert.ok(versions.length > 0);
  assert.equal(new Set(versions).size, versions.length);

  for (let index = 1; index < versions.length; index += 1) {
    const previous = parse(versions[index - 1]);
    const current = parse(versions[index]);
    const previousValue = previous[0] * 1_000_000 + previous[1] * 1_000 + previous[2];
    const currentValue = current[0] * 1_000_000 + current[1] * 1_000 + current[2];
    assert.ok(previousValue > currentValue, `${versions[index - 1]} must precede ${versions[index]}`);
  }
});

test('every release has concise Arabic and English titles and matching change lists', () => {
  for (const release of RELEASE_HISTORY) {
    assert.ok(release.titleAr.trim(), `Arabic release title missing: ${release.version}`);
    assert.ok(release.titleEn.trim(), `English release title missing: ${release.version}`);
    assert.ok(release.changesAr.length > 0, `Arabic changes missing: ${release.version}`);
    assert.equal(
      release.changesAr.length,
      release.changesEn.length,
      `Arabic/English change count differs: ${release.version}`,
    );
    assert.ok(release.changesAr.every((change) => change.trim().length > 0));
    assert.ok(release.changesEn.every((change) => change.trim().length > 0));
  }
});

test('v1.3.0 release notes cover invoice payments, opening stock, and the feature guide', () => {
  const release = RELEASE_HISTORY.find((entry) => entry.version === '1.3.0');

  assert.ok(release, 'v1.3.0 release notes are missing');
  assert.match(release.changesEn.join(' '), /invoice/i);
  assert.match(release.changesEn.join(' '), /opening quantities/i);
  assert.match(release.changesEn.join(' '), /in-app.*guide/i);
});


test('current frontend release metadata is consistent in the configured project root', () => {
  const packageLock = JSON.parse(readFileSync(resolve(frontendRoot, 'package-lock.json'), 'utf8'));
  const escapedVersion = frontendPackage.version.replaceAll('.', '\\.');
  assert.match(frontendPackage.version, /^\d+\.\d+\.\d+$/);
  assert.equal(frontendPackage.name, 'ai-business-assistant-frontend');
  assert.equal(packageLock.version, frontendPackage.version);
  assert.equal(packageLock.packages[''].version, frontendPackage.version);
  assert.match(buildInfo, new RegExp("(?:version:\\s*'" + escapedVersion + "'|\\\"version\\\":\\\"" + escapedVersion + "\\\")"));
  assert.match(serviceWorker, new RegExp("const CACHE_NAME = 'aba-shell-v" + escapedVersion + "-[^']+';"));
  assert.equal(RELEASE_HISTORY[0].version, frontendPackage.version);
  assert.match(RELEASE_HISTORY[0].changesEn.join(' '), new RegExp("version " + escapedVersion, 'i'));
  const previousRelease = RELEASE_HISTORY.find((release) => release.version === '1.3.4');
  assert.ok(previousRelease, 'v1.3.4 release notes are missing');
  const earlierRelease = RELEASE_HISTORY.find((release) => release.version === '1.3.3');
  assert.ok(earlierRelease, 'v1.3.3 release notes are missing');
  assert.match(earlierRelease.changesEn.join(' '), /Vercel frontend-root/i);
  const olderRelease = RELEASE_HISTORY.find((release) => release.version === '1.3.2');
  assert.ok(olderRelease, 'v1.3.2 release notes are missing');
  assert.match(olderRelease.changesEn.join(' '), /Platform Admin/i);
  assert.match(olderRelease.changesEn.join(' '), /audit/i);
});

if (hasBackendPackage) {
  test('frontend and backend release metadata stay aligned in a full repository checkout', () => {
    const backendPackage = readFileSync(resolve(repositoryRoot, 'backend/pyproject.toml'), 'utf8');
    const backendApp = readFileSync(resolve(repositoryRoot, 'backend/app/main.py'), 'utf8');

    assert.match(backendPackage, new RegExp('^version = "' + frontendPackage.version + '"$', 'm'));
    assert.match(backendApp, new RegExp('version="' + frontendPackage.version + '"'));
  });
}

const catalogueById = new Map(FEATURE_CATALOG.map((group) => [group.id, group]));

test('invoice and payment catalogue describe mixed draft editing and safe retry boundaries', () => {
  const invoices = catalogueById.get('invoices');
  const payments = catalogueById.get('payments');
  assert.ok(invoices?.features.some(feature => feature.titleEn === 'Edit an existing draft'));
  assert.ok(invoices?.features.some(feature => feature.detailEn.includes('totals are returned by the server')));
  assert.ok(payments?.features.some(feature => feature.titleEn === 'Safe payment retry'));
  assert.ok(payments?.features.some(feature => feature.detailEn.includes('confirmed no-write rejection')));
});


test('demo catalogue includes all seven implemented operational groups in Arabic and English', () => {
  const expected = [
    ['suppliers', 'الموردون', 'Suppliers'],
    ['purchasing', 'المشتريات والاستلام', 'Purchasing & receiving'],
    ['recurring-invoices', 'الفواتير الدورية', 'Recurring invoices'],
    ['notifications', 'الإشعارات', 'Notifications'],
    ['operational-health', 'الحالة التشغيلية', 'Operational health'],
    ['data-integrity', 'سلامة البيانات', 'Data integrity'],
    ['tax-summary', 'ملخص الضرائب', 'Tax summary'],
  ];

  for (const [id, titleAr, titleEn] of expected) {
    const group = catalogueById.get(id);
    assert.ok(group, `missing catalogue group: ${id}`);
    assert.equal(group.titleAr, titleAr, `${id} Arabic title`);
    assert.equal(group.titleEn, titleEn, `${id} English title`);
    assert.ok(group.noteAr.trim(), `${id} Arabic summary`);
    assert.ok(group.noteEn.trim(), `${id} English summary`);
    assert.ok(group.features.length > 0, `${id} feature list`);

    for (const feature of group.features) {
      assert.ok(feature.titleAr.trim(), `${id} feature Arabic title`);
      assert.ok(feature.titleEn.trim(), `${id} feature English title`);
      assert.ok(feature.detailAr.trim(), `${id} feature Arabic detail`);
      assert.ok(feature.detailEn.trim(), `${id} feature English detail`);
    }
  }
});

test('catalogue clearly discloses deferred execution and read-only boundaries', () => {
  assert.ok(catalogueById.get('purchasing').noteAr.includes('لا تفترض'));
  assert.ok(catalogueById.get('purchasing').noteAr.includes('معالجة محاسبية'));
  assert.ok(catalogueById.get('purchasing').noteEn.includes('does not imply accounting treatment'));
  assert.ok(catalogueById.get('recurring-invoices').noteAr.includes('إنشاء الفواتير الفعلية يعتمد على تنفيذ الخادم'));
  assert.ok(catalogueById.get('recurring-invoices').noteEn.includes('actual invoice creation depends on backend execution'));
  assert.ok(catalogueById.get('notifications').noteAr.includes('الإرسال الفعلي يحتاج مزودًا وعامل تسليم منشورًا'));
  assert.ok(catalogueById.get('notifications').noteEn.includes('actual delivery requires a configured provider and deployed worker'));
  assert.ok(catalogueById.get('data-integrity').noteAr.includes('لا ينفذ إصلاحات تلقائية'));
  assert.ok(catalogueById.get('data-integrity').noteEn.includes('does not automatically repair records'));
  assert.ok(catalogueById.get('tax-summary').noteAr.includes('لا ينشئ إقرارات أو قيودًا أو التزامات ضريبية'));
  assert.ok(catalogueById.get('tax-summary').noteEn.includes('does not create filings, ledger entries, or tax liabilities'));
});
