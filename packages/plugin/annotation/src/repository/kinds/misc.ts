/**
 * The remaining small families: icon kinds (text note / file attachment),
 * stamps, links, widgets, and the unsupported fallback. Icon kinds and links
 * are `/Rect`-movable with tiny prop surfaces; stamps and widgets emit
 * patches here but are not createable through the repository (stamps carry a
 * binary source through their own create path; widgets are form-plane).
 */
import type { ModelAnnotation, TextStyle } from '@embedpdf/core-annotation';
import type { AnnotationDTO, PdfRect } from '@embedpdf/engine-core/runtime';

import { boxEmit, type KindProjection } from '../projection';
import {
  boxGeomFromDTO,
  colorToCss,
  contentToPdfRect,
  pdfToContentRect,
  writableTarget,
} from '../seam';

const rectGeometry = (annotation: ModelAnnotation, crop: PdfRect) =>
  'rect' in annotation.geometry ? { rect: contentToPdfRect(annotation.geometry.rect, crop) } : null;

const iconProjection = (subtype: 'text' | 'file-attachment'): KindProjection => ({
  ingest: (dto, crop) => {
    const iconDto = dto as Extract<AnnotationDTO, { subtype: typeof subtype }>;
    return {
      geometry: { kind: 'rect', rect: pdfToContentRect(iconDto.rect, crop), ellipse: false },
      // The /Name icon is a content projection like `style` — icon kinds only.
      icon: iconDto.icon,
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
    const stampDto = dto as Extract<AnnotationDTO, { subtype: 'stamp' }>;
    return {
      geometry: boxGeomFromDTO(
        stampDto,
        stampDto.rotation ?? undefined,
        stampDto.unrotatedRect ?? undefined,
        crop,
        false,
      ),
    };
  },
  // Geometry only — the visual is the engine-baked /AP, re-fit natively when
  // /Rect changes. Content replacement carries bytes and goes through
  // `capability.update` with an inline `source`, never through this path.
  geometry: (annotation, crop) => boxEmit(annotation, crop),
  createable: false,
};

export const link: KindProjection = {
  ingest: (dto, crop) => {
    const linkDto = dto as Extract<AnnotationDTO, { subtype: 'link' }>;
    return {
      geometry: { kind: 'rect', rect: pdfToContentRect(linkDto.rect, crop), ellipse: false },
      // The link kind's own target — attached links (grouped children of
      // another kind) fold onto their parent's `link` slot instead, in
      // `foldAttachedLinks`.
      link: linkDto.target,
    };
  },
  // A geometry-only move deliberately omits `target`: a foreign read-only /A
  // (javascript/named/…) survives every drag untouched.
  geometry: rectGeometry,
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
    const widgetDto = dto as Extract<AnnotationDTO, { subtype: 'widget' }>;
    return {
      geometry: boxGeomFromDTO(widgetDto, undefined, undefined, crop, false),
      ...(WIDGET_TEXT_KINDS.has(widgetKindOf(widgetDto.fieldFamily))
        ? { text: widgetTextFromDTO(widgetDto) }
        : {}),
    };
  },
  geometry: rectGeometry,
  createable: false,
};

export const unsupported: KindProjection = {
  ingest: (dto, crop) => ({
    geometry: { kind: 'rect', rect: pdfToContentRect(dto.rect, crop), ellipse: false },
  }),
  geometry: () => null,
  createable: false,
};
