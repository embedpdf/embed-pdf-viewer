/**
 * The flat property vocabulary over the model: read and apply
 * {@link AnnotationProps} keys on an `Annot`, routing each key to where it is
 * stored (`style`, `geom.ends`, or `text`) so callers never learn the storage.
 * Which keys a kind takes is declared in the KIND table (`propsFor`); keys a
 * kind doesn't declare are ignored — that's what lets ONE patch restyle a
 * mixed selection.
 */
import { propsFor, type PropSpec } from './kinds';
import { annotTransformable } from './flags';
import type {
  Annot,
  AnnotationProps,
  AnnotationPropsPatch,
  Geom,
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
export const styleFromProps = (p: AnnotationProps): Style => ({
  color: p.color,
  interiorColor: p.interiorColor,
  strokeWidth: p.strokeWidth,
  opacity: p.opacity,
  blendMode: p.blendMode,
  border: p.border,
});

/** The `TextStyle` slice of a resolved props bag (the create-time projection). */
export const textStyleFromProps = (p: AnnotationProps): TextStyle => ({
  fontFamily: p.fontFamily,
  fontSize: p.fontSize,
  fontColor: p.fontColor,
  textAlign: p.textAlign,
});

/** A geom that carries `/LE` endings: a line, or an OPEN poly (polyline). */
const endingsGeom = (g: Geom): g is Extract<Geom, { t: 'line' } | { t: 'poly' }> =>
  g.t === 'line' || (g.t === 'poly' && !g.closed);

/**
 * Read one property off an annotation — from wherever it lives — or `undefined`
 * when the annotation's kind doesn't carry it (a `fontSize` on a square, endings
 * on a polygon). The read side of `applyProps`.
 */
export function readProp<K extends PropKey>(a: Annot, key: K): AnnotationProps[K] | undefined {
  const out = ((): AnnotationProps[PropKey] | undefined => {
    switch (key) {
      case 'color':
        return a.style.color;
      case 'interiorColor':
        return a.style.interiorColor;
      case 'strokeWidth':
        return a.style.strokeWidth;
      case 'opacity':
        return a.style.opacity;
      case 'blendMode':
        return a.style.blendMode;
      case 'border':
        return a.style.border;
      case 'lineEndings':
        return endingsGeom(a.geom) ? (a.geom.ends ?? NO_ENDINGS) : undefined;
      case 'fontFamily':
        return a.text?.fontFamily;
      case 'fontSize':
        return a.text?.fontSize;
      case 'fontColor':
        return a.text?.fontColor;
      case 'textAlign':
        return a.text?.textAlign;
    }
  })();
  return out as AnnotationProps[K] | undefined;
}

/**
 * Apply a property patch to one annotation, honouring its kind's declared keys.
 * Returns the changed annotation, or `null` when nothing applied (locked /
 * read-only per its `/F` flags, or no declared key in the patch) — so the
 * caller emits no spurious engine write. Flags themselves are NOT props: they
 * write through the `setFlags` message, which is deliberately not gated here
 * (unlocking must work on a locked annotation).
 */
export function applyProps(a: Annot, patch: AnnotationPropsPatch): Annot | null {
  if (!annotTransformable(a)) return null;
  const takes = new Set<PropKey>(propsFor(a.subtype).map((s) => s.key));
  let next = a;

  // `!== undefined` (not truthiness): `interiorColor: null` means CLEAR the fill.
  const style: Style = { ...a.style };
  let styleChanged = false;
  if (patch.color !== undefined && takes.has('color')) {
    style.color = patch.color;
    styleChanged = true;
  }
  if (patch.interiorColor !== undefined && takes.has('interiorColor')) {
    style.interiorColor = patch.interiorColor;
    styleChanged = true;
  }
  if (patch.strokeWidth !== undefined && takes.has('strokeWidth')) {
    style.strokeWidth = patch.strokeWidth;
    styleChanged = true;
  }
  if (patch.opacity !== undefined && takes.has('opacity')) {
    style.opacity = patch.opacity;
    styleChanged = true;
  }
  if (patch.blendMode !== undefined && takes.has('blendMode')) {
    style.blendMode = patch.blendMode;
    styleChanged = true;
  }
  if (patch.border !== undefined && takes.has('border')) {
    style.border = patch.border;
    styleChanged = true;
  }
  if (styleChanged) next = { ...next, style };

  if (patch.lineEndings && takes.has('lineEndings') && endingsGeom(next.geom)) {
    const ends: LineEndings = { ...(next.geom.ends ?? NO_ENDINGS), ...patch.lineEndings };
    next = { ...next, geom: { ...next.geom, ends } };
  }

  if (next.text) {
    const text: TextStyle = { ...next.text };
    let textChanged = false;
    if (patch.fontFamily !== undefined && takes.has('fontFamily')) {
      text.fontFamily = patch.fontFamily;
      textChanged = true;
    }
    if (patch.fontSize !== undefined && takes.has('fontSize')) {
      text.fontSize = patch.fontSize;
      textChanged = true;
    }
    if (patch.fontColor !== undefined && takes.has('fontColor')) {
      text.fontColor = patch.fontColor;
      textChanged = true;
    }
    if (patch.textAlign !== undefined && takes.has('textAlign')) {
      text.textAlign = patch.textAlign;
      textChanged = true;
    }
    if (textChanged) next = { ...next, text };
  }

  return next === a ? null : next;
}

/**
 * The ordered property specs EVERY given kind declares — the schema for a mixed
 * selection, in the FIRST kind's display order. One kind → its own list, verbatim.
 */
export function sharedProps(subtypes: readonly string[]): PropSpec[] {
  const unique = [...new Set(subtypes)];
  if (!unique.length) return [];
  const first = propsFor(unique[0]);
  if (unique.length === 1) return first;
  const rest = unique.slice(1).map((s) => new Set(propsFor(s).map((p) => p.key)));
  return first.filter((p) => rest.every((keys) => keys.has(p.key)));
}
