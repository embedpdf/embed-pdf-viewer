/**
 * The seam between the engine's wire vocabulary and the core's model. Both
 * measure places in page space and spell colors as hex, so values pass
 * through as they are.
 */
import type {
  AnnotationDTO,
  AnnotationFlags,
  AnnotationRef,
  Color,
  PageBox,
  PdfLinkTarget,
  PdfLinkTargetWritable,
  WidgetAppearance,
} from '@embedpdf/engine-core/runtime';

import { FLAG_KEYS } from '../flags';
import type { FieldValues, Rect } from '../types';

// The one annotation key (engine-core `annotationKey`): obj:<n> | nm:<page>:<name> | idx:<page>:<i>.
export { annotationKey } from '@embedpdf/core';

/**
 * The model's CSS color as the engine takes it, `'#rrggbb'`: a short `#rgb`
 * is spelled out, and anything else that isn't a hex color is black.
 */
export function hexColorOf(css: string): Color {
  const trimmed = css.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : '#000000';
}

/** The `/F` flags of a read, as the model's one flag set. */
export function flagsOf(dto: AnnotationFlags): AnnotationFlags {
  return Object.fromEntries(FLAG_KEYS.map((key) => [key, dto[key]])) as unknown as AnnotationFlags;
}

/* Rotation: the model's `rot` and the engine's `rotation` are both degrees
 * clockwise, so they pass through unchanged. */

/** `rot` for a point kind's geom (line, polygon, polyline, ink), from a DTO's
 *  `rotation`: the turn its points are drawn with. Absent → no `rot` key
 *  (kept off the geom so unrotated shapes stay clean). */
export const rotFromDTO = (rotation?: number | null): { rot?: number } =>
  rotation ? { rot: rotation } : {};

/**
 * The geometry of a turning box kind the core still keeps as `rect` + `rot`
 * (free text, caret): its box before any turn and the turn. The engine works
 * out `/Rect`, the upright box around all it draws. The turn is stated as
 * `null` when there is none (total projection — the engine's tri-state writes
 * keep an omitted field, so an omission would keep a stale turn).
 */
export function boxGeomFields(rect: Rect, rot: number): { box: PageBox; rotation: number | null } {
  return { box: rect, rotation: rot || null };
}

/** The writable projection of a `link` value: `goto`/`uri` pass through,
 *  read-only arms (`javascript`, `named`, `goto-remote`, `launch`,
 *  `unsupported`) yield `null` — they can be carried, never (re)written. */
export function writableTarget(
  target: PdfLinkTarget | null | undefined,
): PdfLinkTargetWritable | null {
  return target && (target.kind === 'goto' || target.kind === 'uri') ? target : null;
}

const WIDGET_APPEARANCE_FIELDS = [
  'color',
  'interiorColor',
  'strokeWidth',
  'borderStyle',
  'fontFamily',
  'fontSize',
  'fontColor',
  'textAlign',
] as const;

/**
 * A form tool's defaults as the engine's widget appearance for `doc.forms`
 * authoring: the widget's style fields among them, as they are. Absent fields
 * stay absent (the engine writes nothing for them).
 */
export function widgetAppearanceOf(defaults: FieldValues): WidgetAppearance {
  return Object.fromEntries(
    WIDGET_APPEARANCE_FIELDS.filter((name) => defaults[name] !== undefined).map((name) => [
      name,
      defaults[name],
    ]),
  ) as WidgetAppearance;
}
