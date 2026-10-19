import {
  EngineError,
  EngineErrorCode,
  rgbOf,
  type OutlineItemPatch,
  type PdfDestination,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { withUtf16String } from '../../../runtime/memory/strings';
import { createLinkTargetAction } from '../../destinations/linkTarget';

/** `/F` bit 1. */
const ITALIC = 1;
/** `/F` bit 2. */
const BOLD = 2;

/** The most a PDF text string holds in every PDF app (ISO 32000-2 Annex C). */
const MAX_TITLE_LENGTH = 32_767;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Refuses, before anything is written, fields no write can take: a title
 * too long, a colour that isn't `#rrggbb`, a target a write can't make.
 */
export function assertWritableFields(fields: OutlineItemPatch<PdfDestination>): void {
  const refuse = (field: string, message: string) => {
    throw new EngineError(EngineErrorCode.InvalidArg, message, { details: { field } });
  };
  if (fields.title !== undefined) {
    if (typeof fields.title !== 'string') refuse('title', 'a title is a string');
    if (fields.title.length > MAX_TITLE_LENGTH) {
      refuse('title', `a title holds at most ${MAX_TITLE_LENGTH} characters`);
    }
  }
  if (fields.color != null && !HEX_COLOR.test(fields.color)) {
    refuse('color', "expected a color as '#rrggbb'");
  }
  const target = fields.target as { kind: string; name?: string } | null | undefined;
  if (target != null) {
    const standard = ['NextPage', 'PrevPage', 'FirstPage', 'LastPage'];
    const writable =
      target.kind === 'goto' ||
      target.kind === 'uri' ||
      (target.kind === 'named' && standard.includes(target.name ?? ''));
    if (!writable) refuse('target', `a '${target.kind}' target can't be written`);
  }
}

/**
 * Writes the fields `fields` names on the item `objectNumber`; the others
 * stay as they are. A target is always written as `/A`, as a link's is.
 */
export function writeOutlineFields(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  objectNumber: number,
  fields: OutlineItemPatch<PdfDestination>,
): void {
  const { fn, mem } = runtime;
  const check = (ok: boolean, what: string) => {
    if (!ok) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `the ${what} of outline item ${objectNumber} could not be written`,
      );
    }
  };
  if (fields.title !== undefined) {
    const title = fields.title;
    check(
      withUtf16String(mem, title, (ptr) => fn.EPDFOutline_SetTitle(docPtr, objectNumber, ptr)),
      'title',
    );
  }
  if (fields.target !== undefined) {
    const action =
      fields.target === null ? NULL_PTR : createLinkTargetAction(fn, mem, docPtr, fields.target);
    check(fn.EPDFOutline_SetAction(docPtr, objectNumber, action), 'target');
  }
  if (fields.color !== undefined) {
    if (fields.color === null) {
      check(fn.EPDFOutline_SetColor(docPtr, objectNumber, false, 0, 0, 0), 'colour');
    } else {
      const { r, g, b } = rgbOf(fields.color);
      check(
        fn.EPDFOutline_SetColor(docPtr, objectNumber, true, r / 255, g / 255, b / 255),
        'colour',
      );
    }
  }
  if (fields.bold !== undefined || fields.italic !== undefined) {
    // Other /F bits, which a later PDF version may define, stay.
    let flags = fn.FPDFBookmark_GetStyle(fn.EPDFOutline_GetItem(docPtr, objectNumber));
    if (fields.bold !== undefined) flags = fields.bold ? flags | BOLD : flags & ~BOLD;
    if (fields.italic !== undefined) flags = fields.italic ? flags | ITALIC : flags & ~ITALIC;
    check(fn.EPDFOutline_SetStyle(docPtr, objectNumber, flags), 'style');
  }
  if (fields.open !== undefined) {
    check(fn.EPDFOutline_SetOpen(docPtr, objectNumber, fields.open), 'open state');
  }
}
