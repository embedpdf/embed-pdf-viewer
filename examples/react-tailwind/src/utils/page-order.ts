export function movePageInOrder(order: number[], fromIndex: number, toIndex: number): number[] {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= order.length) {
    return order;
  }

  const next = [...order];
  const [pageIndex] = next.splice(fromIndex, 1);
  if (pageIndex === undefined) return order;

  const safeToIndex = Math.max(0, Math.min(toIndex, next.length));
  next.splice(safeToIndex, 0, pageIndex);

  return next;
}

export function moveSourcePagesInOrder(
  order: number[],
  sourcePageIndexes: number[],
  toIndex: number,
): number[] {
  const sourcePageIndexSet = new Set(
    sourcePageIndexes.filter((pageIndex) => Number.isInteger(pageIndex)),
  );

  const targetPageIndex = order[toIndex];

  if (
    sourcePageIndexSet.size === 0 ||
    (targetPageIndex !== undefined && sourcePageIndexSet.has(targetPageIndex))
  ) {
    return order;
  }

  const movingPageIndexes = order.filter((pageIndex) => sourcePageIndexSet.has(pageIndex));
  if (movingPageIndexes.length === 0) return order;

  const next = order.filter((pageIndex) => !sourcePageIndexSet.has(pageIndex));
  const safeToIndex = Math.max(0, Math.min(toIndex, next.length));
  next.splice(safeToIndex, 0, ...movingPageIndexes);

  return next;
}

export function moveSourcePagesByOffset(
  order: number[],
  sourcePageIndexes: number[],
  offset: number,
): number[] {
  if (offset === 0) return order;

  const sourcePageIndexSet = new Set(
    sourcePageIndexes.filter((pageIndex) => Number.isInteger(pageIndex)),
  );

  if (sourcePageIndexSet.size === 0) return order;

  const selectedPositions = order
    .map((pageIndex, index) => (sourcePageIndexSet.has(pageIndex) ? index : -1))
    .filter((index) => index >= 0);

  if (selectedPositions.length === 0) return order;

  const firstSelectedPosition = Math.min(...selectedPositions);
  const lastSelectedPosition = Math.max(...selectedPositions);

  if (
    (offset < 0 && firstSelectedPosition === 0) ||
    (offset > 0 && lastSelectedPosition === order.length - 1)
  ) {
    return order;
  }

  const movingPageIndexes = order.filter((pageIndex) => sourcePageIndexSet.has(pageIndex));
  const next = order.filter((pageIndex) => !sourcePageIndexSet.has(pageIndex));
  const safeToIndex = Math.max(0, Math.min(firstSelectedPosition + offset, next.length));

  next.splice(safeToIndex, 0, ...movingPageIndexes);

  return next;
}

export function moveSourcePageInOrder(
  order: number[],
  sourcePageIndex: number,
  toIndex: number,
): number[] {
  return movePageInOrder(order, order.indexOf(sourcePageIndex), toIndex);
}
