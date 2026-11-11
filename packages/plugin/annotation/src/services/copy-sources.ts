/**
 * The picture source of each copy this session staged: the annotation whose
 * picture the copy shows until the engine has drawn the copy.
 *
 * A copy that is on its way says what it copies in its record (`copyOf`,
 * sync/records.ts), and a copy of it finds a picture by following those
 * (read/render.ts). The records can't say it once the engine wrote a copy in
 * between: that record is the engine's now, and its own picture isn't loaded
 * yet. So the source behind a copy is noted here when the copy is staged, and
 * kept for as long as the copy is among the records.
 */
import type { Mirror } from '@embedpdf/core';
import { annotationKey, type AnnotationRef } from '@embedpdf/engine-core/runtime';

import type { AnnotationRecords, CopyOf } from '../sync/records';

export interface CopySources {
  /**
   * Note the copies a staged copy makes, in the order they are made: each
   * shows the picture its original shows, which is its original's source when
   * that one was noted too.
   */
  note(copies: readonly Pick<CopyOf, 'ref' | 'of'>[]): void;
  /** The annotation whose picture a noted copy shows; `null` for any other record. */
  of(id: string): AnnotationRef | null;
}

export function createCopySources(records: Pick<Mirror<AnnotationRecords>, 'view'>): CopySources {
  const sources = new Map<string, AnnotationRef>();
  return {
    note(copies) {
      // A copy that left the records (deleted, undone, refused) needs no source.
      const { byKey } = records.view();
      for (const key of sources.keys()) if (!(key in byKey)) sources.delete(key);
      for (const { ref, of } of copies) {
        sources.set(annotationKey(ref), sources.get(annotationKey(of)) ?? of);
      }
    },
    of: (id) => sources.get(id) ?? null,
  };
}
