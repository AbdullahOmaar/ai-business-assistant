import assert from 'node:assert/strict';
import test from 'node:test';
import { appendUniquePage } from './list-pagination.ts';

interface Row { id: string; name: string; }

test('appends new rows and preserves existing order while ignoring IDs already loaded', () => {
  const current: Row[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const page: Row[] = [{ id: 'b', name: 'Updated B' }, { id: 'c', name: 'C' }];
  const result = appendUniquePage(current, page, 100, 100);
  assert.deepEqual(result.items.map(item => item.id), ['a', 'b', 'c']);
  assert.equal(result.items[1].name, 'B');
  assert.equal(result.nextOffset, 102);
  assert.equal(result.hasMore, false);
});

test('also removes duplicate IDs within a single returned page', () => {
  const result = appendUniquePage<Row>([], [
    { id: 'a', name: 'A1' }, { id: 'a', name: 'A2' }, { id: 'b', name: 'B' },
  ], 0, 3);
  assert.deepEqual(result.items.map(item => item.id), ['a', 'b']);
  assert.equal(result.nextOffset, 3);
  assert.equal(result.hasMore, true);
});

test('advances offset by raw page length even when every row was already loaded', () => {
  const current: Row[] = [{ id: 'a', name: 'A' }];
  const result = appendUniquePage(current, [{ id: 'a', name: 'A' }], 100, 100);
  assert.deepEqual(result.items, current);
  assert.equal(result.nextOffset, 101);
  assert.equal(result.hasMore, false);
});

test('marks only full pages as having another page', () => {
  assert.equal(appendUniquePage<Row>([], [{ id: 'a', name: 'A' }], 0, 1).hasMore, true);
  assert.equal(appendUniquePage<Row>([], [{ id: 'a', name: 'A' }], 0, 2).hasMore, false);
  assert.equal(appendUniquePage<Row>([], [], 0, 2).hasMore, false);
});

test('rejects invalid offsets and page sizes', () => {
  assert.throws(() => appendUniquePage<Row>([], [], -1, 10), RangeError);
  assert.throws(() => appendUniquePage<Row>([], [], 0, 0), RangeError);
  assert.throws(() => appendUniquePage<Row>([], [], 1.5, 10), RangeError);
});
