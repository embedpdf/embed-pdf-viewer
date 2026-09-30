/**
 * Every annotation kind. Each is declared in its own file in this folder: its
 * shape family, how it is drawn, what a user can do to it, and what a sidebar
 * edits. To add a kind, declare it in a file and list it below.
 *
 * A kind is how an annotation is edited; a tool is how one is made (tools/,
 * in the plugin). Many tools can make one kind: ink and the ink highlighter,
 * a line and an arrow.
 */
import { boxFamily } from '../shapes';
import { caret } from './caret';
import { circle } from './circle';
import { NO_CAPS, type AnnotationKind } from './define';
import { fileAttachment } from './file-attachment';
import { freeText, freeTextCallout } from './free-text';
import { highlight } from './highlight';
import { ink } from './ink';
import { line } from './line';
import { link } from './link';
import { polygon } from './polygon';
import { polyline } from './polyline';
import { redact } from './redact';
import { square } from './square';
import { squiggly } from './squiggly';
import { stamp } from './stamp';
import { strikeout } from './strikeout';
import { textNote } from './text-note';
import { underline } from './underline';
import {
  widgetBox,
  widgetButton,
  widgetChoice,
  widgetRadio,
  widgetText,
  widgetToggle,
} from './widget';
import { plainStyle } from './styles';

export { defineKind, NO_CAPS, type AnnotationKind, type FieldSpec, type KindCaps } from './define';
export { fieldFamilyOfKind, widgetKindOf } from './widget';

/** The kinds, by name. */
export const KINDS: Readonly<Record<string, AnnotationKind>> = {
  [square.name]: square,
  [circle.name]: circle,
  [line.name]: line,
  [polygon.name]: polygon,
  [polyline.name]: polyline,
  [ink.name]: ink,
  [freeText.name]: freeText,
  [freeTextCallout.name]: freeTextCallout,
  [highlight.name]: highlight,
  [underline.name]: underline,
  [squiggly.name]: squiggly,
  [strikeout.name]: strikeout,
  [caret.name]: caret,
  [redact.name]: redact,
  [textNote.name]: textNote,
  [fileAttachment.name]: fileAttachment,
  [stamp.name]: stamp,
  [link.name]: link,
  [widgetText.name]: widgetText,
  [widgetChoice.name]: widgetChoice,
  [widgetButton.name]: widgetButton,
  [widgetToggle.name]: widgetToggle,
  [widgetRadio.name]: widgetRadio,
  [widgetBox.name]: widgetBox,
};

/**
 * A kind the viewer shows but doesn't edit (a popup, an annotation type it
 * doesn't model): drawn from the engine's raster, with nothing to do to it.
 */
const shownOnly = new Map<string, AnnotationKind>();

/** The kind named `name`; a name no kind has reads as one that is only shown. */
export function kindNamed(name: string): AnnotationKind {
  const kind = KINDS[name];
  if (kind) return kind;
  let shown = shownOnly.get(name);
  if (!shown) {
    shown = { name, family: boxFamily, style: plainStyle, caps: NO_CAPS, fields: [] };
    shownOnly.set(name, shown);
  }
  return shown;
}
