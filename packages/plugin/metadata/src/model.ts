import type { DocumentMetadata } from '@embedpdf/core';

/** The keys whose values differ between two snapshots (shallow; `custom` by entries). */
export function changedKeys(
  previous: DocumentMetadata | null,
  next: DocumentMetadata,
): readonly (keyof DocumentMetadata)[] {
  const keys = Object.keys(next) as (keyof DocumentMetadata)[];
  if (!previous) return keys;
  return keys.filter((key) => {
    if (key === 'custom') return JSON.stringify(previous[key]) !== JSON.stringify(next[key]);
    return previous[key] !== next[key];
  });
}
