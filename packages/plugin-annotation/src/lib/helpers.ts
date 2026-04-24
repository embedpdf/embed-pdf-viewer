import {
  PdfAnnotationSubtype,
  PdfAnnotationObject,
  PdfAnnotationOf,
  PdfSquigglyAnnoObject,
  PdfStrikeOutAnnoObject,
  PdfUnderlineAnnoObject,
  PdfHighlightAnnoObject,
  Rect,
} from '@embedpdf/models';
import { LockMode, LockModeType, TrackedAnnotation } from './types';
import { AnnotationTool } from './tools/types';

/* ------------------------------------------------------------------ */
/* Geometry Helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Check if two rectangles intersect
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.origin.x + a.size.width < b.origin.x ||
    b.origin.x + b.size.width < a.origin.x ||
    a.origin.y + a.size.height < b.origin.y ||
    b.origin.y + b.size.height < a.origin.y
  );
}

/* ------------------------------------------------------------------ */
/* 1. Generic “subtype‑to‑object” mapper                              */
/* ------------------------------------------------------------------ */

export type AnnoOf<S extends PdfAnnotationSubtype> = PdfAnnotationOf<S>;

export type TextMarkupSubtype =
  | PdfAnnotationSubtype.HIGHLIGHT
  | PdfAnnotationSubtype.UNDERLINE
  | PdfAnnotationSubtype.STRIKEOUT
  | PdfAnnotationSubtype.SQUIGGLY;
export type SidebarSubtype =
  | TextMarkupSubtype
  | PdfAnnotationSubtype.TEXT
  | PdfAnnotationSubtype.INK
  | PdfAnnotationSubtype.SQUARE
  | PdfAnnotationSubtype.CIRCLE
  | PdfAnnotationSubtype.POLYGON
  | PdfAnnotationSubtype.LINE
  | PdfAnnotationSubtype.POLYLINE
  | PdfAnnotationSubtype.FREETEXT
  | PdfAnnotationSubtype.STAMP
  | PdfAnnotationSubtype.REDACT
  | PdfAnnotationSubtype.CARET;

/* ------------------------------------------------------------------ */
/* 2. Narrowing type‑guards (add more as needed)                      */
/* ------------------------------------------------------------------ */

/** True when `a.object.type === INK` – and narrows the generic. */
export function isInk(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.INK>> {
  return a.object.type === PdfAnnotationSubtype.INK;
}

/** Example for Circle – create similar ones for Square, Line, etc. */
export function isCircle(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.CIRCLE>> {
  return a.object.type === PdfAnnotationSubtype.CIRCLE;
}

export function isPolygon(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.POLYGON>> {
  return a.object.type === PdfAnnotationSubtype.POLYGON;
}

export function isSquare(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.SQUARE>> {
  return a.object.type === PdfAnnotationSubtype.SQUARE;
}

export function isLine(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.LINE>> {
  return a.object.type === PdfAnnotationSubtype.LINE;
}

export function isPolyline(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.POLYLINE>> {
  return a.object.type === PdfAnnotationSubtype.POLYLINE;
}

export function isHighlight(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.HIGHLIGHT>> {
  return a.object.type === PdfAnnotationSubtype.HIGHLIGHT;
}

export function isUnderline(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.UNDERLINE>> {
  return a.object.type === PdfAnnotationSubtype.UNDERLINE;
}

export function isStrikeout(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.STRIKEOUT>> {
  return a.object.type === PdfAnnotationSubtype.STRIKEOUT;
}

export function isSquiggly(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.SQUIGGLY>> {
  return a.object.type === PdfAnnotationSubtype.SQUIGGLY;
}

export function isTextMarkup(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<TextMarkupSubtype>> {
  return isHighlight(a) || isUnderline(a) || isStrikeout(a) || isSquiggly(a);
}

export function isFreeText(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.FREETEXT>> {
  return a.object.type === PdfAnnotationSubtype.FREETEXT;
}

export function isStamp(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.STAMP>> {
  return a.object.type === PdfAnnotationSubtype.STAMP;
}

export function isText(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.TEXT>> {
  return a.object.type === PdfAnnotationSubtype.TEXT;
}

export function isLink(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.LINK>> {
  return a.object.type === PdfAnnotationSubtype.LINK;
}

export function isRedact(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.REDACT>> {
  return a.object.type === PdfAnnotationSubtype.REDACT;
}

export function isCaret(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.CARET>> {
  return a.object.type === PdfAnnotationSubtype.CARET;
}

export function isWidget(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<PdfAnnotationSubtype.WIDGET>> {
  return a.object.type === PdfAnnotationSubtype.WIDGET;
}

export function isSidebarAnnotation(
  a: TrackedAnnotation,
): a is TrackedAnnotation<AnnoOf<SidebarSubtype>> {
  return (
    (isText(a) && !a.object.inReplyToId) ||
    isTextMarkup(a) ||
    isInk(a) ||
    isSquare(a) ||
    isCircle(a) ||
    isPolygon(a) ||
    isLine(a) ||
    isPolyline(a) ||
    isFreeText(a) ||
    isStamp(a) ||
    isRedact(a) ||
    isCaret(a)
  );
}

export function isSelectableAnnotation(a: TrackedAnnotation): boolean {
  return isSidebarAnnotation(a) || isWidget(a);
}

/* ------------------------------------------------------------------ */
/* Locking Helpers                                                     */
/* ------------------------------------------------------------------ */

/** Extract the category tags from a tool (returns `[]` for uncategorized). */
export function getAnnotationCategories(tool: AnnotationTool | null): string[] {
  return tool?.categories ?? [];
}

/** Check if the category-based LockMode locks annotations with these categories. */
export function isCategoryLocked(categories: string[], mode: LockMode): boolean {
  switch (mode.type) {
    case LockModeType.None:
      return false;
    case LockModeType.All:
      return true;
    case LockModeType.Include:
      if (categories.length === 0) return false;
      return categories.some((cat) => mode.categories.includes(cat));
    case LockModeType.Exclude:
      if (categories.length === 0) return true;
      return !categories.some((cat) => mode.categories.includes(cat));
  }
}

/** Check if the annotation itself has the PDF 'locked' flag (bit 7). */
export function hasLockedFlag(annotation: PdfAnnotationObject): boolean {
  return annotation.flags?.includes('locked') ?? false;
}

/** Check if the annotation has the PDF 'noView' flag (bit 6). */
export function hasNoViewFlag(annotation: PdfAnnotationObject): boolean {
  return annotation.flags?.includes('noView') ?? false;
}

/** Check if the annotation has the PDF 'hidden' flag (bit 2): do not render, do not interact, do not print. */
export function hasHiddenFlag(annotation: PdfAnnotationObject): boolean {
  return annotation.flags?.includes('hidden') ?? false;
}

/** Check if the annotation has the PDF 'readOnly' flag (bit 7): do not allow user interaction. Ignored for widgets per spec. */
export function hasReadOnlyFlag(annotation: PdfAnnotationObject): boolean {
  return annotation.flags?.includes('readOnly') ?? false;
}

/** Check if the annotation has the PDF 'lockedContents' flag (bit 10): content cannot be modified by the user. */
export function hasLockedContentsFlag(annotation: PdfAnnotationObject): boolean {
  return annotation.flags?.includes('lockedContents') ?? false;
}
