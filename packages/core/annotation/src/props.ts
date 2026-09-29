/**
 * The flat property vocabulary over the model: read and apply
 * {@link AnnotationProps} keys on an `ModelAnnotation`, routing each key to where it is
 * stored (`style`, `geom.ends`, or `text`) so callers never learn the storage.
 * Which keys a kind takes is declared in the kind table (`propsFor`); keys a
 * kind doesn't declare are ignored — that's what lets one patch restyle a
 * mixed selection.
 */
import { propsFor, type PropSpec } from './kinds';
import { annotTransformable } from './flags';
import type {
  ModelAnnotation,
  AnnotationProps,
  AnnotationPropsPatch,
  ModelGeometry,
  LineEndings,
  PropKey,
  Style,
  TextStyle,
} from './types';

const NO_ENDINGS: LineEndings = { start: 'none', end: 'none' };

/** Base text styling for kinds/tools with no explicit defaults. */
export const initialTextStyle: TextStyle = {
  fontFamily: 'helvetica',
  fontSize: 14,
  fontColor: '#000000',
  textAlign: 'left',
};

/** The `Style` slice of a resolved props bag (the create-time projection). */
export const styleFromProps = (props: AnnotationProps): Style => ({
  color: props.color,
  interiorColor: props.interiorColor,
  strokeWidth: props.strokeWidth,
  opacity: props.opacity,
  blendMode: props.blendMode,
  border: props.border,
});

/** The `TextStyle` slice of a resolved props bag (the create-time projection). */
export const textStyleFromProps = (props: AnnotationProps): TextStyle => ({
  fontFamily: props.fontFamily,
  fontSize: props.fontSize,
  fontColor: props.fontColor,
  textAlign: props.textAlign,
  ...(props.bold !== undefined ? { bold: props.bold } : {}),
  ...(props.italic !== undefined ? { italic: props.italic } : {}),
  ...(props.underline !== undefined ? { underline: props.underline } : {}),
});

/** Does this kind's prop table declare `link` (attachable link)? The link
 *  Kind itself also declares it, but stores its own `/A` instead. */
export const kindTakesLink = (subtype: string): boolean =>
  propsFor(subtype).some((spec) => spec.key === 'link');

/** A geom that carries `/LE` endings: a line, or an open poly (polyline). */
const endingsGeom = (
  geometry: ModelGeometry,
): geometry is Extract<ModelGeometry, { kind: 'line' } | { kind: 'poly' }> =>
  geometry.kind === 'line' || (geometry.kind === 'poly' && !geometry.closed);

/**
 * Read one property off an annotation — from wherever it lives — or `undefined`
 * when the annotation's kind doesn't carry it (a `fontSize` on a square, endings
 * on a polygon). The read side of `applyProps`.
 */
export function readProp<K extends PropKey>(
  annotation: ModelAnnotation,
  key: K,
): AnnotationProps[K] | undefined {
  const out = ((): AnnotationProps[PropKey] | undefined => {
    switch (key) {
      case 'color':
        return annotation.style.color;
      case 'interiorColor':
        return annotation.style.interiorColor;
      case 'strokeWidth':
        return annotation.style.strokeWidth;
      case 'opacity':
        return annotation.style.opacity;
      case 'blendMode':
        return annotation.style.blendMode;
      case 'border':
        return annotation.style.border;
      case 'lineEndings':
        return endingsGeom(annotation.geometry)
          ? (annotation.geometry.ends ?? NO_ENDINGS)
          : undefined;
      case 'fontFamily':
        return annotation.text?.fontFamily;
      case 'fontSize':
        return annotation.text?.fontSize;
      case 'fontColor':
        return annotation.text?.fontColor;
      case 'textAlign':
        return annotation.text?.textAlign;
      case 'bold':
        return annotation.text ? (annotation.text.bold ?? false) : undefined;
      case 'italic':
        return annotation.text ? (annotation.text.italic ?? false) : undefined;
      case 'underline':
        return annotation.text ? (annotation.text.underline ?? false) : undefined;
      case 'icon':
        return annotation.icon;
      case 'link':
        return annotation.link;
    }
  })();
  return out as AnnotationProps[K] | undefined;
}

/**
 * Apply a property patch to one annotation, honouring its kind's declared keys.
 * Returns the changed annotation, or `null` when nothing applied (locked /
 * read-only per its `/F` flags, or no declared key in the patch) — so the
 * caller emits no spurious engine write. Flags themselves are not props: they
 * write through the `setFlags` message, which is deliberately not gated here
 * (unlocking must work on a locked annotation).
 */
export function applyProps(
  annotation: ModelAnnotation,
  patch: AnnotationPropsPatch,
): ModelAnnotation | null {
  if (!annotTransformable(annotation)) return null;
  const takes = new Set<PropKey>(propsFor(annotation.subtype).map((spec) => spec.key));
  /** A key this kind takes, set to a value other than the one it has. */
  const changes = <K extends PropKey>(key: K, current: unknown): boolean =>
    patch[key] !== undefined && takes.has(key) && !sameProp(patch[key], current);
  let next = annotation;

  // `!== undefined` (not truthiness): `interiorColor: null` means clear the fill.
  const style: Style = { ...annotation.style };
  let styleChanged = false;
  for (const key of STYLE_PROPS) {
    if (!changes(key, style[key])) continue;
    (style as unknown as Record<string, unknown>)[key] = patch[key];
    styleChanged = true;
  }
  if (styleChanged) next = { ...next, style };

  if (patch.lineEndings && takes.has('lineEndings') && endingsGeom(next.geometry)) {
    const ends: LineEndings = { ...(next.geometry.ends ?? NO_ENDINGS), ...patch.lineEndings };
    if (!sameProp(ends, next.geometry.ends ?? NO_ENDINGS)) {
      next = { ...next, geometry: { ...next.geometry, ends } };
    }
  }

  if (changes('icon', annotation.icon)) {
    next = { ...next, icon: patch.icon };
  }

  // Only the link kind stores `link` (its own /A, a real wire prop). On every
  // other kind the value lives in attached child annotations: `setProps`
  // emits the `syncLink` intent instead of touching the model, and reads
  // derive through the `linkOf` lens.
  if (annotation.subtype === 'link' && changes('link', annotation.link ?? null)) {
    next = { ...next, link: patch.link };
  }

  if (next.text) {
    const text: TextStyle = { ...next.text };
    let textChanged = false;
    for (const key of TEXT_PROPS) {
      if (!changes(key, text[key])) continue;
      (text as unknown as Record<string, unknown>)[key] = patch[key];
      textChanged = true;
    }
    for (const key of ['bold', 'italic', 'underline'] as const) {
      if (!changes(key, text[key] ?? false)) continue;
      text[key] = patch[key];
      textChanged = true;
    }
    if (textChanged) next = { ...next, text };
  }

  return next === annotation ? null : next;
}

const STYLE_PROPS = [
  'color',
  'interiorColor',
  'strokeWidth',
  'opacity',
  'blendMode',
  'border',
] as const satisfies readonly (keyof Style & PropKey)[];

const TEXT_PROPS = [
  'fontFamily',
  'fontSize',
  'fontColor',
  'textAlign',
] as const satisfies readonly (keyof TextStyle & PropKey)[];

/** Two prop values alike: the same value, or the same border, endings or link target. */
const sameProp = (left: unknown, right: unknown): boolean =>
  left === right || JSON.stringify(left) === JSON.stringify(right);

/**
 * The ordered property specs every given kind declares — the schema for a mixed
 * selection, in the first kind's display order. One kind → its own list, verbatim.
 */
export function sharedProps(subtypes: readonly string[]): PropSpec[] {
  const unique = [...new Set(subtypes)];
  if (!unique.length) return [];
  const first = propsFor(unique[0]);
  if (unique.length === 1) return first;
  const rest = unique.slice(1).map((subtype) => new Set(propsFor(subtype).map((spec) => spec.key)));
  return first.filter((spec) => rest.every((keys) => keys.has(spec.key)));
}
