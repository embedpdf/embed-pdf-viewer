import {
  encodePageKey,
  pageRefsIn,
  toPageRef,
  type BundlePage,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratch } from '../../runtime/memory/scratch';
import { RECTF_BYTES } from '../../runtime/memory/structs';
import { readBoxes } from '../pages/PagesReader';

/**
 * A bundle's page table: every page `rows` are on or point at (each
 * `PageRef` anywhere in them), in document order, with its position and
 * the size of its visible box.
 */
export function bundlePagesOf(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  rows: readonly unknown[],
): BundlePage[] {
  const { fn, mem } = runtime;
  const named = new Set(rows.flatMap((row) => pageRefsIn(row).map(encodePageKey)));
  const docPtr = session.requireDocPtr();
  return withScratch(mem, RECTF_BYTES, (rectPtr) =>
    session
      .allRecords()
      .filter((record) => named.has(encodePageKey(toPageRef(record.pageObjectNumber))))
      .map((record) => {
        const visible = readBoxes(fn, mem, docPtr, record.pageIndex, rectPtr).crop;
        return {
          page: toPageRef(record.pageObjectNumber),
          position: record.pageIndex,
          size: { width: visible.right - visible.left, height: visible.top - visible.bottom },
        };
      }),
  );
}
