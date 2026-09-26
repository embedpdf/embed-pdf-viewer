import type { ReadOf } from '../declaration';
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

/** The complete read of any annotation, discriminated by `subtype`. */
export type AnnotationRead = ReadOf<AnnotationDeclaration>;

/** Looks up a kind's declaration by its `subtype`. */
export function declarationOf(subtype: string): AnnotationDeclaration | null {
  return ANNOTATION_DECLARATIONS.find((declaration) => declaration.subtype === subtype) ?? null;
}
