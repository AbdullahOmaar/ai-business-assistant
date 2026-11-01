export interface PageAppendResult<T> {
  items: T[];
  nextOffset: number;
  hasMore: boolean;
}

/** Append a server page without duplicate IDs while advancing by the raw page size. */
export function appendUniquePage<T extends { id: string }>(
  current: readonly T[],
  page: readonly T[],
  offset: number,
  pageSize: number,
): PageAppendResult<T> {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError('Page offset must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError('Page size must be a positive safe integer.');
  }

  const seen = new Set(current.map(item => item.id));
  const appended: T[] = [];
  for (const item of page) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    appended.push(item);
  }

  return {
    items: [...current, ...appended],
    nextOffset: offset + page.length,
    hasMore: page.length === pageSize,
  };
}
