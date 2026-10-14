import type { CreateOf, ReadOf, UpdateOf } from '../declaration';
import type { Coordinates, PageCoordinates } from '../../pageSpace/coordinates';
import { CaretDeclaration } from './caret/declaration';
import { CircleDeclaration } from './circle/declaration';
import { FileAttachmentDeclaration } from './file-attachment/declaration';
import { FreeTextDeclaration } from './free-text/declaration';
import { HighlightDeclaration } from './highlight/declaration';
import { InkDeclaration } from './ink/declaration';
import { LineDeclaration } from './line/declaration';
import { LinkDeclaration } from './link/declaration';
import { PolygonDeclaration } from './polygon/declaration';
import { PolylineDeclaration } from './polyline/declaration';
import { PopupDeclaration } from './popup/declaration';
import { RedactDeclaration } from './redact/declaration';
import { SquareDeclaration } from './square/declaration';
import { SquigglyDeclaration } from './squiggly/declaration';
import { StampDeclaration } from './stamp/declaration';
import { StrikeoutDeclaration } from './strikeout/declaration';
import { TextDeclaration } from './text/declaration';
import { UnderlineDeclaration } from './underline/declaration';
import { UnsupportedDeclaration } from './unsupported/declaration';
import { WidgetDeclaration } from './widget/declaration';

/** Every annotation kind's declaration, in the engine's catalog order. */
export const ANNOTATION_DECLARATIONS = [
  HighlightDeclaration,
  UnderlineDeclaration,
  SquigglyDeclaration,
  StrikeoutDeclaration,
  CircleDeclaration,
  SquareDeclaration,
  PolygonDeclaration,
  PolylineDeclaration,
  LineDeclaration,
  LinkDeclaration,
  InkDeclaration,
  FreeTextDeclaration,
  CaretDeclaration,
  TextDeclaration,
  StampDeclaration,
  FileAttachmentDeclaration,
  WidgetDeclaration,
  RedactDeclaration,
  PopupDeclaration,
  UnsupportedDeclaration,
] as const;

export type AnnotationDeclaration = (typeof ANNOTATION_DECLARATIONS)[number];

/** The kinds a create or an update can name: every kind the engine models. */
export type WritableAnnotationDeclaration = Exclude<
  AnnotationDeclaration,
  typeof UnsupportedDeclaration
>;

/**
 * The complete read of any annotation, discriminated by `subtype`: in page
 * space, or in the file's coordinates with `PdfCoordinates`.
 */
export type Annotation<C extends Coordinates = PageCoordinates> = ReadOf<AnnotationDeclaration, C>;

/**
 * What `create()` takes, and what the worker protocol and the HTTP surface
 * carry: pure JSON. Bytes travel beside it, as resources
 * (`annotation/resources.ts`).
 */
export type AnnotationDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  WritableAnnotationDeclaration,
  C
>;

/** What `update()` takes. */
export type AnnotationPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  WritableAnnotationDeclaration,
  C
>;

/** Looks up a kind's declaration by its `subtype`. */
export function declarationOf(subtype: string): AnnotationDeclaration | null {
  return ANNOTATION_DECLARATIONS.find((declaration) => declaration.subtype === subtype) ?? null;
}
