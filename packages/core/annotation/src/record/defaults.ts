/**
 * A tool's defaults, read as the core's fields: the tool's engine fields laid
 * over the engine's own defaults for its kind, read the way a record reads.
 */
import {
  annotationDefaultsOf,
  type AnnotationDTO,
  type AnnotationSubtype,
  type LineEnding,
  type LineEndings,
  type PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';

import { initialTextStyle } from '../props';
import type { FieldValues, Style, TextStyle } from '../types';
import { textFromDTO } from './kinds/freeText';
import { widgetTextFromDTO } from './kinds/misc';
import { styleFromDTO } from './seam';

/** The engine subtype a client kind creates: a callout is a free text, a form tool's kind a widget. */
export const engineSubtypeOf = (kind: string): AnnotationSubtype =>
  kind === 'free-text-callout'
    ? 'free-text'
    : kind.startsWith('widget')
      ? 'widget'
      : (kind as AnnotationSubtype);

/** A tool's `defaults` over the engine's defaults for `kind`: what a create from the tool starts from. */
export function readOfDefaults(kind: string, defaults: FieldValues): AnnotationDTO {
  const subtype = engineSubtypeOf(kind);
  return { subtype, ...annotationDefaultsOf(subtype), ...defaults } as unknown as AnnotationDTO;
}

/** The text a read gives a text-bearing kind; the house text style fills what it doesn't say. */
function textOfRead(read: AnnotationDTO): TextStyle {
  const text: Partial<TextStyle> =
    read.subtype === 'free-text'
      ? textFromDTO(read)
      : read.subtype === 'widget'
        ? widgetTextFromDTO(read)
        : read.subtype === 'redact'
          ? {
              fontFamily: read.fontFamily,
              fontSize: read.fontSize,
              fontColor: read.fontColor,
              textAlign: read.textAlign,
            }
          : {};
  const given = Object.fromEntries(
    Object.entries(text).filter(([, value]) => value !== undefined && value !== null),
  );
  return { ...initialTextStyle, ...given };
}

/** What a tool draws with, read from its defaults over the engine's for its kind. */
export interface ToolStyle {
  readonly style: Style;
  readonly text: TextStyle;
  /** A line's or polyline's endings. */
  readonly lineEndings: LineEndings;
  /** A callout's arrow. */
  readonly lineEnding: LineEnding;
  /** A link's own target, `null` for none. */
  readonly target: PdfLinkTarget | null;
}

const NO_ENDINGS: LineEndings = { start: 'none', end: 'none' };

/** What a new record of `kind` takes from a tool's `defaults`. */
export function styleOfDefaults(kind: string, defaults: FieldValues): ToolStyle {
  const read = readOfDefaults(kind, defaults) as AnnotationDTO & {
    lineEndings?: LineEndings;
    lineEnding?: LineEnding | null;
    target?: PdfLinkTarget | null;
  };
  return {
    style: styleFromDTO(read),
    text: textOfRead(read),
    lineEndings: read.lineEndings ?? NO_ENDINGS,
    lineEnding: read.lineEnding ?? 'none',
    target: read.target ?? null,
  };
}
