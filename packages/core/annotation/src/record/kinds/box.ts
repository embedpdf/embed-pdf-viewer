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

import type { TextStyle } from '../../types';
import type { KindProjection, Wire } from '../projection';
import { borderSlice } from '../props';
import { widgetKindOf } from '../../kinds';
import { writableTarget } from '../seam';

/** Square and circle: the border picker states the cloud (`null` when plain). */
const shape: KindProjection = {
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
    // The /Name icon is a content projection like `style` — icon kinds only.
    return { icon: iconDto.icon };
  },
  // Creates go through the click-to-place path (placement.ts), which also
  // carries the attached file for file-attachment — never `toCreateDraft`.
  createable: false,
});

export const textNote = iconProjection('text');
export const fileAttachment = iconProjection('file-attachment');

/** A stamp is its shape alone: the visual is the engine-baked /AP, re-fit
 *  natively (with the stamp's recorded fit) when its box changes. A new
 *  drawing is bytes: it goes to the engine as the `appearance` resource,
 *  never through this path. */
export const stamp: KindProjection = { createable: false };

export const link: KindProjection = {
  ingest: (dto) => {
    const linkDto = dto as Extract<AnnotationDTO, { subtype: 'link' }>;
    // The link kind's own target — attached links (grouped children of
    // another kind) fold onto their parent's `link` slot instead, in
    // `foldAttachedLinks`. A move writes its shape alone, never `target`: a
    // foreign read-only /A (javascript/named/…) survives every drag.
    return { link: linkDto.target };
  },
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
    return WIDGET_TEXT_KINDS.has(widgetKindOf(widgetDto.fieldFamily))
      ? { text: widgetTextFromDTO(widgetDto) }
      : {};
  },
  prop: {
    // A widget's border has a style but no dash pattern of its own.
    border: (annotation) => ({
      borderStyle: annotation.style.border.kind === 'dashed' ? 'dashed' : 'solid',
    }),
  },
  createable: false,
};

export const unsupported: KindProjection = { createable: false };
