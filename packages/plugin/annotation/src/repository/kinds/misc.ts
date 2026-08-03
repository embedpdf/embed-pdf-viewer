/**
 * The remaining small families: icon kinds (text note / file attachment),
 * stamps, links, widgets, and the unsupported fallback. Icon kinds and links
 * are `/Rect`-movable with tiny prop surfaces; stamps and widgets emit
 * patches here but are NOT createable through the repository (stamps carry a
 * binary source through their own create path; widgets are form-plane).
 */
import type { AnnotationDTO, PdfRect } from '@embedpdf/engine-core/runtime';
import type { Annot, TextStyle } from '@embedpdf/core-annotation';

import { boxEmit, type KindProjection } from '../projection';
import {
  boxGeomFromDTO,
  colorToCss,
  contentToPdfRect,
  pdfToContentRect,
  writableTarget,
} from '../seam';

const rectGeometry = (a: Annot, crop: PdfRect) =>
  'rect' in a.geom ? { rect: contentToPdfRect(a.geom.rect, crop) } : null;

const iconProjection = (subtype: 'text' | 'file-attachment'): KindProjection => ({
  ingest: (dto, crop) => {
    const d = dto as Extract<AnnotationDTO, { subtype: typeof subtype }>;
    return {
      geom: { t: 'rect', rect: pdfToContentRect(d.rect, crop), ellipse: false },
      // The /Name icon is a content projection like `style` — icon kinds only.
      icon: d.icon,
    };
  },
  geometry: rectGeometry,
  // Creates go through the click-to-place path (placement.ts), which also
  // carries the attached file for file-attachment — never this repository.
  createable: false,
});

export const textNote = iconProjection('text');
export const fileAttachment = iconProjection('file-attachment');

export const stamp: KindProjection = {
  ingest: (dto, crop) => {
    const d = dto as Extract<AnnotationDTO, { subtype: 'stamp' }>;
    return { geom: boxGeomFromDTO(d, d.rotation, d.unrotatedRect, crop, false) };
  },
  // Geometry only — the visual is the engine-baked /AP, re-fit natively when
  // /Rect changes. Content replacement carries bytes and goes through
  // `capability.update` with an inline `source`, never through this path.
  geometry: (a, crop) => boxEmit(a, crop),
  createable: false,
};

export const link: KindProjection = {
  ingest: (dto, crop) => {
    const d = dto as Extract<AnnotationDTO, { subtype: 'link' }>;
    return {
      geom: { t: 'rect', rect: pdfToContentRect(d.rect, crop), ellipse: false },
      // The link kind's own target — attached links (grouped children of
      // another kind) fold onto their PARENT's `link` slot instead, in
      // `foldAttachedLinks`.
      link: d.target,
    };
  },
  // A geometry-only move deliberately omits `target`: a foreign read-only /A
  // (javascript/named/…) survives every drag untouched.
  geometry: rectGeometry,
  prop: {
    // Three-state target: a writable value replaces `/A`; an explicit model
    // `null` CLEARS it (the engine removes /A + /Dest); a read-only arm is
    // left untouched — the foreign action survives.
    link: (a) => {
      const target = writableTarget(a.link);
      return target ? { target } : a.link == null ? { target: null } : {};
    },
  },
  // The create-then-edit flow states its (possibly null) target explicitly.
  draftExtras: (a) => ({ target: writableTarget(a.link) }),
};

/** One PDF `widget` subtype → per-family CLIENT kinds (radios have no font). */
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

function widgetTextFromDTO(dto: Extract<AnnotationDTO, { subtype: 'widget' }>): TextStyle {
  return {
    fontFamily: dto.fontFamily ?? 'helvetica',
    fontSize: dto.fontSize ?? 0, // 0 = auto-size
    fontColor: dto.fontColor ? colorToCss(dto.fontColor) : '#000000',
    textAlign: dto.textAlign,
  };
}

export const widget: KindProjection = {
  ingest: (dto, crop) => {
    const d = dto as Extract<AnnotationDTO, { subtype: 'widget' }>;
    return {
      geom: boxGeomFromDTO(d, undefined, undefined, crop, false),
      ...(WIDGET_TEXT_KINDS.has(widgetKindOf(d.fieldFamily)) ? { text: widgetTextFromDTO(d) } : {}),
    };
  },
  geometry: rectGeometry,
  createable: false,
};

export const unsupported: KindProjection = {
  ingest: (dto, crop) => ({
    geom: { t: 'rect', rect: pdfToContentRect(dto.rect, crop), ellipse: false },
  }),
  geometry: () => null,
  createable: false,
};
