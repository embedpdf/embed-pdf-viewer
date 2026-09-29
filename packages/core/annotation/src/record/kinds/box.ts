/**
 * The box family's kinds: squares, circles, stamps, icon kinds (text note /
 * file attachment), links, widgets, and the unsupported fallback. Each one's
 * box is read and written by the family (`shapes/box.ts`); what a kind adds
 * here is beside its box: a square's cloud, an icon, a link's target, a
 * widget's text. Stamps and widgets are not created through `toCreateDraft`
 * (stamps carry a binary source through their own create path; widgets are
 * form-plane).
 */
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import { readBox, writeBox } from '../../shapes/box';
import type { RecordFields, TextStyle } from '../../types';
import type { KindProjection, Wire } from '../projection';
import { borderSlice } from '../props';
import { writableTarget } from '../seam';

/** The engine fields that state a box kind's shape. */
export const boxGeometry = (annotation: RecordFields): Wire | null =>
  annotation.geometry.kind === 'box' ? writeBox(annotation.geometry, annotation.subtype) : null;

/** Square and circle: the box and its turn; the border picker states the cloud (`null` when plain). */
const shape: KindProjection = {
  ingest: (dto) => ({ geometry: readBox(dto) }),
  geometry: boxGeometry,
  prop: {
    border: (annotation) => ({
      ...borderSlice(annotation.style),
      cloudyIntensity:
        annotation.style.border.kind === 'cloudy' ? annotation.style.border.intensity : null,
    }),
  },
};

export const square = shape;
export const circle = shape;

const iconProjection = (subtype: 'text' | 'file-attachment'): KindProjection => ({
  ingest: (dto) => {
    const iconDto = dto as Extract<AnnotationDTO, { subtype: typeof subtype }>;
    return {
      geometry: readBox(iconDto),
      // The /Name icon is a content projection like `style` — icon kinds only.
      icon: iconDto.icon,
    };
  },
  geometry: boxGeometry,
  // Creates go through the click-to-place path (placement.ts), which also
  // carries the attached file for file-attachment — never `toCreateDraft`.
  createable: false,
});

export const textNote = iconProjection('text');
export const fileAttachment = iconProjection('file-attachment');

export const stamp: KindProjection = {
  ingest: (dto) => ({ geometry: readBox(dto) }),
  // Geometry only — the visual is the engine-baked /AP, re-fit natively (with
  // the stamp's recorded fit) when its box changes. A new drawing is bytes: it
  // goes to the engine as the `appearance` resource, never through this path.
  geometry: boxGeometry,
  createable: false,
};

export const link: KindProjection = {
  ingest: (dto) => {
    const linkDto = dto as Extract<AnnotationDTO, { subtype: 'link' }>;
    return {
      geometry: readBox(linkDto),
      // The link kind's own target — attached links (grouped children of
      // another kind) fold onto their parent's `link` slot instead, in
      // `foldAttachedLinks`.
      link: linkDto.target,
    };
  },
  // A geometry-only move deliberately omits `target`: a foreign read-only /A
  // (javascript/named/…) survives every drag untouched.
  geometry: boxGeometry,
  prop: {
    // Three-state target: a writable value replaces `/A`; an explicit model
    // `null` clears it (the engine removes /A + /Dest); a read-only arm is
    // left untouched — the foreign action survives.
    link: (annotation) => {
      const target = writableTarget(annotation.link);
      return target ? { target } : annotation.link == null ? { target: null } : {};
    },
  },
  // The create-then-edit flow states its (possibly null) target explicitly.
  draftExtras: (annotation) => ({ target: writableTarget(annotation.link) }),
};

/** One PDF `widget` subtype → per-family client kinds (radios have no font). */
const WIDGET_KIND_BY_FAMILY: Record<string, string> = {
  text: 'widget-text',
  combobox: 'widget-choice',
  listbox: 'widget-choice',
  pushbutton: 'widget-button',
  checkbox: 'widget-toggle',
  radio: 'widget-toggle',
};
export const widgetKindOf = (family: string): string =>
  WIDGET_KIND_BY_FAMILY[family] ?? 'widget-box';
const WIDGET_TEXT_KINDS = new Set(['widget-text', 'widget-choice', 'widget-button']);

export function widgetTextFromDTO(dto: Extract<AnnotationDTO, { subtype: 'widget' }>): TextStyle {
  return {
    fontFamily: dto.fontFamily ?? 'helvetica',
    fontSize: dto.fontSize ?? 0, // 0 = auto-size
    fontColor: dto.fontColor ? dto.fontColor : '#000000',
    textAlign: dto.textAlign,
  };
}

export const widget: KindProjection = {
  ingest: (dto) => {
    const widgetDto = dto as Extract<AnnotationDTO, { subtype: 'widget' }>;
    return {
      geometry: readBox(widgetDto),
      ...(WIDGET_TEXT_KINDS.has(widgetKindOf(widgetDto.fieldFamily))
        ? { text: widgetTextFromDTO(widgetDto) }
        : {}),
    };
  },
  geometry: boxGeometry,
  prop: {
    // A widget's border has a style but no dash pattern of its own.
    border: (annotation) => ({
      borderStyle: annotation.style.border.kind === 'dashed' ? 'dashed' : 'solid',
    }),
  },
  createable: false,
};

export const unsupported: KindProjection = {
  ingest: (dto) => ({ geometry: readBox(dto) }),
  geometry: () => null,
  createable: false,
};
