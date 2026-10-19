/**
 * Authoring: a drawn or typed mark rendered to a one-page PDF (the
 * annotation is authored on a scratch page and exported the way "stamp from
 * selection" exports), a page of a PDF as a single-page PDF, and the bytes
 * an asset is made from.
 */
import { resolveBinarySource } from '@embedpdf/engine-core/runtime';

import { blankLibraryPdf } from '../blank-library';
import type { AddAssetInput, MarkSource } from '../contract';
import type { StampServices } from '../services';
import { stampError } from '../services/errors';

/** A mark's `#rrggbb` color, checked before anything is drawn. */
const hexColor = (hex: string): string => {
  const color = hex.trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw stampError('invalid-input', `mark color must be #rrggbb, got '${hex}'`);
  }
  return color;
};

/** An exact ArrayBuffer over a view (the engine's binary idiom). */
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

/** An ink mark's strokes, as the engine takes them; a mark needs at least one point. */
const inkListOf = (
  strokes: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
): { x: number; y: number }[][] => {
  if (!strokes.some((stroke) => stroke.length > 0))
    throw stampError('invalid-input', 'an ink mark needs at least one point');
  return strokes.map((stroke) => stroke.map(({ x, y }) => ({ x, y })));
};

/**
 * A generous box for typed text. The export keeps the whole box, so the
 * text is centered in it: the mark then sits in the middle of a preview
 * or a signature field.
 */
const textBounds = (
  text: string,
  fontSize: number,
): { x: number; y: number; width: number; height: number } => ({
  x: 0,
  y: 0,
  width: Math.max(1, text.length) * fontSize * 0.75 + fontSize,
  height: fontSize * 1.6,
});

export function createMarks({ assetEngine }: Pick<StampServices, 'assetEngine'>) {
  const { openAssetDocument } = assetEngine;

  /**
   * A drawn or typed mark rendered to a one-page PDF: the annotation is
   * authored on a scratch page and exported the way "stamp from selection"
   * exports — a fresh page the size of the mark, paths kept as paths, the
   * font subset-embedded. Self-contained and Acrobat-readable.
   */
  const renderMark = async (
    mark: Extract<MarkSource, { kind: 'ink' | 'text' }>,
  ): Promise<Uint8Array> => {
    const doc = await openAssetDocument(blankLibraryPdf());
    try {
      const layout = await doc.pages.list();
      const scratch = layout.pages[0];
      if (!scratch) throw stampError('operation-failed', 'the scratch document has no page');
      const page = doc.page(scratch.ref);
      const color = hexColor(mark.color ?? '#1d2b53');
      const created =
        mark.kind === 'ink'
          ? await page.annotations.create({
              subtype: 'ink',
              inkList: inkListOf(mark.strokes),
              color,
              strokeWidth: mark.strokeWidth ?? 2,
            })
          : await page.annotations.create({
              subtype: 'free-text',
              intent: 'free-text',
              contents: mark.text,
              fontFamily: mark.fontFamily,
              fontSize: mark.fontSize ?? 36,
              textAlign: 'center',
              verticalAlign: 'middle',
              box: textBounds(mark.text, mark.fontSize ?? 36),
              fontColor: color,
              strokeWidth: 0,
            });
      return new Uint8Array(await page.annotations.exportAppearance([created.annotation.ref]));
    } finally {
      await doc.close();
    }
  };

  /** One page of a PDF as a single-page PDF (a `pdf` mark with `pageIndex`). */
  const extractPage = async (bytes: Uint8Array, pageIndex: number): Promise<Uint8Array> => {
    const doc = await openAssetDocument(bytes);
    try {
      const layout = await doc.pages.list();
      const page = layout.pages[pageIndex];
      if (!page) {
        throw stampError(
          'invalid-input',
          `the PDF has no page ${pageIndex} (${layout.pageCount} pages)`,
        );
      }
      return await doc.pages.extract([page.ref]);
    } finally {
      await doc.close();
    }
  };

  /** The bytes an asset is made from: the caller's `source`, or its `mark` authored into one. */
  const resolveAssetSource = async (
    input: AddAssetInput,
  ): Promise<{ bytes: ArrayBuffer; mimeType?: string }> => {
    if ((input.source === undefined) === (input.mark === undefined)) {
      throw stampError('invalid-input', 'createAsset takes exactly one of `source` / `mark`');
    }
    if (input.source !== undefined) return resolveBinarySource(input.source);
    const mark = input.mark!;
    switch (mark.kind) {
      case 'image':
        return resolveBinarySource(mark.source);
      case 'pdf': {
        const resolved = await resolveBinarySource(mark.source);
        if (mark.pageIndex === undefined) return resolved;
        return {
          bytes: toArrayBuffer(await extractPage(new Uint8Array(resolved.bytes), mark.pageIndex)),
        };
      }
      case 'ink':
      case 'text':
        return { bytes: toArrayBuffer(await renderMark(mark)) };
    }
  };

  return { resolveAssetSource };
}
export type StampMarks = ReturnType<typeof createMarks>;
