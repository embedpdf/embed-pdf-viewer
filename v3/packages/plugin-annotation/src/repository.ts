/**
 * The boundary between the engine's PDF-space annotation DTOs and the core's
 * content-space `Annot`. The ONLY place this plugin crosses the geometry seam
 * (the bridge) and the colour seam (engine `Color` ↔ CSS). Covers all 9 kinds.
 */
import type {
  AnnotationDraft,
  AnnotationDTO,
  AnnotationPatch,
  AnnotationRef,
  CalloutLine,
  Color,
  InkList,
  LineEnding,
  LineEndings,
  LinePoints,
  PdfPoint,
  PdfRect,
  PdfRectDifferences,
  StandardFont,
  WidgetAppearance,
} from '@embedpdf/engine-core/runtime';
import {
  calloutLinePoints,
  cloudyBorderExtent,
  contentToPdfPoint,
  contentToPdfRect,
  geomPdfBounds,
  geomRotation,
  initialTextStyle,
  normalizeDeg,
  pdfToContentPoint,
  pdfToContentRect,
  rotatedAabb,
  type Annot,
  type AnnotationPropsPatch,
  type Border,
  type Geom,
  type Quad,
  type Rect,
  type Style,
  type TextStyle,
} from '@embedpdf-x/annotation-core';

export function refKey(ref: AnnotationRef): string {
  return ref.kind === 'objectNumber'
    ? `obj:${ref.annotObjectNumber}`
    : ref.kind === 'nm'
      ? `nm:${ref.nm}`
      : `idx:${ref.pageObjectNumber}:${ref.index}`;
}

const h2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
export const colorToCss = (c: Color): string => `#${h2(c.r)}${h2(c.g)}${h2(c.b)}`;
export function cssToColor(css: string): Color {
  const s = css.trim();
  const m6 = /^#?([0-9a-f]{6})$/i.exec(s);
  if (m6) {
    const n = parseInt(m6[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m3 = /^#?([0-9a-f]{3})$/i.exec(s);
  if (m3) {
    const [a, b, c] = m3[1];
    return { r: parseInt(a + a, 16), g: parseInt(b + b, 16), b: parseInt(c + c, 16) };
  }
  return { r: 0, g: 0, b: 0 };
}

/**
 * The flat props vocabulary (CSS colours, house keys) → the engine's widget
 * appearance for `doc.forms` authoring — the SAME mapping `toPatch`'s widget
 * branch uses, exported as a boundary utility so the form plugin can style
 * `placeField` from a tool's `currentDefaults` without growing a second CSS
 * parser. Absent keys stay absent (the engine writes nothing for them).
 */
export function widgetAppearanceFromProps(props: AnnotationPropsPatch): WidgetAppearance {
  return {
    ...(props.color !== undefined ? { color: cssToColor(props.color) } : {}),
    ...(props.interiorColor !== undefined
      ? { interiorColor: props.interiorColor ? cssToColor(props.interiorColor) : null }
      : {}),
    ...(props.strokeWidth !== undefined ? { strokeWidth: props.strokeWidth } : {}),
    ...(props.border !== undefined
      ? { borderStyle: props.border.kind === 'dashed' ? ('dashed' as const) : ('solid' as const) }
      : {}),
    ...(props.fontFamily !== undefined ? { fontFamily: props.fontFamily as StandardFont } : {}),
    ...(props.fontSize !== undefined ? { fontSize: props.fontSize } : {}),
    ...(props.fontColor !== undefined ? { fontColor: cssToColor(props.fontColor) } : {}),
    ...(props.textAlign !== undefined ? { textAlign: props.textAlign } : {}),
  };
}

const TEXT_MARKUP = new Set(['highlight', 'underline', 'squiggly', 'strikeout']);
// Geometric kinds that carry the `/C` stroke colour + `/BS` border. Ink belongs
// here too (it has a stroke but no `/IC`, so its interiorColor reads back null).
const STROKE_KINDS = new Set(['square', 'circle', 'line', 'polygon', 'polyline', 'ink']);

/* ── rotation seam (CW content ↔ PDF convention) ──────────────────────────────
 * The model's `rot` is CLOCKWISE in content space (y-down). PDF user space is
 * y-up, so the y-flip at this boundary turns a CW content tilt into a CCW PDF
 * tilt of the same magnitude — i.e. the stored `/EMBD_Metadata/Rotation` is the
 * NEGATION (mod 360). This is the ONE place the convention is converted; every
 * layer above speaks CW-content and the engine/PDFium speaks the PDF angle.
 */
const toPdfRotation = (rotCW: number): number => normalizeDeg(-rotCW);
const fromPdfRotation = (rotPdf: number): number => normalizeDeg(-rotPdf);

/**
 * Geometry/rotation fields for a BOX kind (square/circle/plain free-text). The
 * model's `rect` is the UNROTATED logical box and `rot` the applied tilt, so:
 *  - rot == 0 → `/Rect` IS the box; no rotation metadata.
 *  - rot != 0 → `/Rect` is the rotated visual AABB (PDFium clips the baked /AP to
 *    it), `unrotatedRect` is the logical box, and `rotation` the PDF angle. The
 *    engine bakes a portable `/AP /Matrix` from those two.
 */
export function boxGeomFields(
  rect: Rect,
  rot: number,
  crop: PdfRect,
): { rect: PdfRect; unrotatedRect?: PdfRect; rotation?: number } {
  if (!rot) return { rect: contentToPdfRect(rect, crop) };
  return {
    rect: contentToPdfRect(rotatedAabb(rect, rot), crop),
    unrotatedRect: contentToPdfRect(rect, crop),
    rotation: toPdfRotation(rot),
  };
}

/** Advisory rotation for a VERTEX kind (line/poly/ink): the points are already
 *  rotated, so this scalar is inert for AP — it just records the applied angle so
 *  EmbedPDF can show an oriented box + offer reset. Absent when not rotated. */
const advisoryRotation = (g: Geom): { rotation?: number } => {
  const rot = geomRotation(g);
  return rot ? { rotation: toPdfRotation(rot) } : {};
};

/**
 * Engine DTO → content-space Annot. `source` decides how it renders: `'baked'`
 * shows the engine's appearance raster (a page load, or a remote edit — trust
 * the authored AP); `'vector'` renders live from geom/style (we authored or
 * changed it). `apBox` is the raster's content-space box, used while baked.
 */
// One PDF subtype -> per-family CLIENT kinds (radio widgets have no font).
const WIDGET_KIND_BY_FAMILY: Record<string, string> = {
  text: 'widget-text',
  combobox: 'widget-choice',
  listbox: 'widget-choice',
  pushbutton: 'widget-button',
  checkbox: 'widget-toggle',
  radio: 'widget-toggle',
};
const widgetKindOf = (family: string): string => WIDGET_KIND_BY_FAMILY[family] ?? 'widget-box';
const WIDGET_TEXT_KINDS = new Set(['widget-text', 'widget-choice', 'widget-button']);

function widgetTextFromDTO(dto: Extract<AnnotationDTO, { subtype: 'widget' }>): TextStyle {
  return {
    fontFamily: dto.fontFamily ?? 'helvetica',
    fontSize: dto.fontSize ?? 0, // 0 = auto-size
    fontColor: dto.fontColor ? colorToCss(dto.fontColor) : '#000000',
    textAlign: dto.textAlign,
  };
}

export function fromDTO(
  dto: AnnotationDTO,
  crop: PdfRect,
  source: 'baked' | 'vector' = 'baked',
): Annot {
  const base = {
    id: refKey(dto.ref),
    ref: dto.ref,
    pon: dto.pageObjectNumber,
    subtype: dto.subtype === 'widget' ? widgetKindOf(dto.fieldFamily) : dto.subtype,
    // `/F` verbatim — every behavioral question (visible? selectable? frozen?)
    // is answered by the core's flag predicates, never derived here.
    flags: dto.flags,
    source,
    // Carry the canonical DTO; geom/style below are derived projections of it.
    data: dto,
    // Relationship to a parent annotation. `irt` mirrors `/IRT`; `group` is the
    // primary's key for `/RT /Group` subordinates only (a visual group acts as a
    // unit). `/RT /R` (comment replies) keep `irt` but are NOT a visual group.
    ...(dto.inReplyTo ? { irt: refKey(dto.inReplyTo) } : {}),
    ...(dto.replyType === 'group' && dto.inReplyTo ? { group: refKey(dto.inReplyTo) } : {}),
    ...((dto.subtype === 'caret' || dto.subtype === 'strikeout' || dto.subtype === 'ink') &&
    dto.intent
      ? { intent: dto.intent }
      : {}),
  };
  const geom = geomFromDTO(dto, crop);
  // Rotation-stripped appearances (mirrors the engine's EXACT condition — see
  // AnnotationAppearanceReader): only when the DTO carries BOTH `rotation` and
  // `unrotatedRect` (box-family kinds) is the raster flat and placed by the
  // unrotated box, with the stripped rotation re-applied as a view transform
  // (`apRot`). Vertex kinds pre-rotate their geometry and never carry
  // `unrotatedRect` — their rasters stay placed by `/Rect`, untransformed.
  // A CALLOUT is excluded even when it carries both fields: only its text BOX
  // tilts, via an INLINE matrix mid-stream (the leader is page-space), so its
  // /AP form `/Matrix` is identity and the raster stays placed by `/Rect`.
  const isCallout = dto.subtype === 'free-text' && dto.intent === 'free-text-callout';
  const strippedRect =
    !isCallout && 'unrotatedRect' in dto && 'rotation' in dto && dto.rotation
      ? dto.unrotatedRect
      : undefined;
  return {
    ...base,
    geom,
    style: styleFromDTO(dto),
    // Text styling is a content projection of the DTO, exactly like `style` —
    // present only for text-editable kinds. The colour seam is crossed HERE.
    ...(dto.subtype === 'free-text' ? { text: textFromDTO(dto) } : {}),
    // A redaction label is `/DA`-styled exactly like free text.
    ...(dto.subtype === 'redact' ? { text: redactTextFromDTO(dto) } : {}),
    // The /Name icon is a content projection like `style` — icon kinds only.
    ...(dto.subtype === 'text' || dto.subtype === 'file-attachment' ? { icon: dto.icon } : {}),
    ...(dto.subtype === 'widget' && WIDGET_TEXT_KINDS.has(widgetKindOf(dto.fieldFamily))
      ? { text: widgetTextFromDTO(dto) }
      : {}),
    apBox: pdfToContentRect(strippedRect ?? dto.rect, crop),
    ...(strippedRect ? { apRot: geomRotation(geom) } : {}),
  };
}

/** Free-text `/DA` fields → content {@link TextStyle}. An absent `fontColor`
 *  falls back to the `/DA` colour — the same rule the CPVT renderer applies. */
function textFromDTO(dto: Extract<AnnotationDTO, { subtype: 'free-text' }>): TextStyle {
  return {
    fontFamily: dto.fontFamily,
    fontSize: dto.fontSize,
    fontColor: colorToCss(dto.fontColor ?? dto.color),
    textAlign: dto.textAlign,
  };
}

/** Redact label `/DA` fields → content {@link TextStyle}. `fontSize` 0 means
 *  auto-fit and round-trips verbatim (the engine's convention). */
function redactTextFromDTO(dto: Extract<AnnotationDTO, { subtype: 'redact' }>): TextStyle {
  return {
    fontFamily: dto.fontFamily,
    fontSize: dto.fontSize,
    fontColor: colorToCss(dto.fontColor),
    textAlign: dto.textAlign,
  };
}

function geomFromDTO(dto: AnnotationDTO, crop: PdfRect): Geom {
  switch (dto.subtype) {
    case 'widget':
      return boxGeomFromDTO(dto, undefined, undefined, crop, false);
    case 'square':
    case 'stamp':
      return boxGeomFromDTO(dto, dto.rotation, dto.unrotatedRect, crop, false);
    case 'circle':
      return boxGeomFromDTO(dto, dto.rotation, dto.unrotatedRect, crop, true);
    case 'line':
      return {
        t: 'line',
        a: pdfToContentPoint(dto.linePoints.start, crop),
        b: pdfToContentPoint(dto.linePoints.end, crop),
        ends: dto.lineEndings,
        ...rotFromDTO(dto.rotation),
      };
    case 'polyline':
      return {
        t: 'poly',
        points: dto.vertices.map((p) => pdfToContentPoint(p, crop)),
        closed: false,
        ends: dto.lineEndings,
        ...rotFromDTO(dto.rotation),
      };
    case 'polygon':
      return {
        t: 'poly',
        points: dto.vertices.map((p) => pdfToContentPoint(p, crop)),
        closed: true,
        ...rotFromDTO(dto.rotation),
      };
    case 'ink':
      return {
        t: 'ink',
        strokes: dto.inkList.map((stroke) => stroke.map((p) => pdfToContentPoint(p, crop))),
        ...rotFromDTO(dto.rotation),
      };
    case 'free-text': {
      // A callout (`/IT free-text-callout` + a `/CL` leader): the stored `rect` is
      // the TEXT BOX (the overall `/Rect` inset by `/RD`); the leader's tip is
      // `cl[0]` and the elbow `cl[1]` (a 3-point `/CL`). The connection point —
      // `cl` last — is NOT stored; it's re-derived from the box. A tilted box
      // (the upright policy) reads back from `unrotatedRect` + `rotation`
      // instead — `/RD` only recovers its axis-aligned AABB; foreign PDFs
      // (no EMBD metadata) keep the `/RD` path bit-identically.
      if (dto.intent === 'free-text-callout' && dto.calloutLine && dto.calloutLine.length >= 2) {
        const cl = dto.calloutLine;
        const rot = dto.rotation ? fromPdfRotation(dto.rotation) : 0;
        const box =
          rot && dto.unrotatedRect
            ? pdfToContentRect(dto.unrotatedRect, crop)
            : pdfToContentRect(insetPdfRectByRD(dto.rect, dto.rectDifferences), crop);
        return {
          t: 'text',
          rect: box,
          callout: {
            tip: pdfToContentPoint(cl[0], crop),
            knee: cl.length === 3 ? pdfToContentPoint(cl[1], crop) : undefined,
            ending: dto.lineEnding ?? 'none',
          },
          ...(rot && dto.unrotatedRect ? { rot } : {}),
        };
      }
      // Plain text box: a box kind — read back the unrotated box + advisory tilt.
      const rot = dto.rotation ? fromPdfRotation(dto.rotation) : 0;
      const box = rot && dto.unrotatedRect ? dto.unrotatedRect : dto.rect;
      return { t: 'text', rect: pdfToContentRect(box, crop), ...(rot ? { rot } : {}) };
    }
    case 'highlight':
    case 'underline':
    case 'squiggly':
    case 'strikeout':
      return {
        t: 'quads',
        quads: dto.quadPoints.map(
          (q) =>
            [
              pdfToContentPoint(q.p1, crop),
              pdfToContentPoint(q.p2, crop),
              pdfToContentPoint(q.p3, crop),
              pdfToContentPoint(q.p4, crop),
            ] as Quad,
        ),
      };
    case 'redact':
      // Text redaction carries per-line quads; an AREA redaction is rect-only
      // (`/Rect` IS the removal region per ISO 32000-2), so its geometry is a
      // box and it moves/resizes like a shape.
      return dto.quadPoints.length > 0
        ? {
            t: 'quads',
            quads: dto.quadPoints.map(
              (q) =>
                [
                  pdfToContentPoint(q.p1, crop),
                  pdfToContentPoint(q.p2, crop),
                  pdfToContentPoint(q.p3, crop),
                  pdfToContentPoint(q.p4, crop),
                ] as Quad,
            ),
          }
        : { t: 'rect', rect: pdfToContentRect(dto.rect, crop), ellipse: false };
    case 'caret':
      return { t: 'caret', rect: pdfToContentRect(dto.rect, crop) };
    default:
      return { t: 'rect', rect: pdfToContentRect(dto.rect, crop), ellipse: false };
  }
}

/** Advisory `rot` for a vertex geom, from a DTO's (PDF-convention) `rotation`.
 *  Absent → no `rot` key (kept off the geom so unrotated shapes stay clean). */
const rotFromDTO = (rotation?: number): { rot?: number } =>
  rotation ? { rot: fromPdfRotation(rotation) } : {};

/** A box geom (square/circle) from its DTO: when rotated, the LOCAL box is the
 *  stored `unrotatedRect` (the AABB `/Rect` is the rendered envelope) and `rot`
 *  the converted tilt; unrotated, `/Rect` IS the box. */
function boxGeomFromDTO(
  dto: { rect: PdfRect },
  rotation: number | undefined,
  unrotatedRect: PdfRect | undefined,
  crop: PdfRect,
  ellipse: boolean,
): Geom {
  const rot = rotation ? fromPdfRotation(rotation) : 0;
  const box = rot && unrotatedRect ? unrotatedRect : dto.rect;
  return { t: 'rect', rect: pdfToContentRect(box, crop), ellipse, ...(rot ? { rot } : {}) };
}

/** Engine border fields (`/BS /S`, `/BS /D`, `/BE /I`) → the `Border` union. A
 *  cloudy effect wins over the underlying border style (which stays solid). */
function borderFromDTO(d: {
  borderStyle?: string;
  dashArray?: number[];
  cloudyIntensity?: number;
}): Border {
  if ((d.cloudyIntensity ?? 0) > 0) return { kind: 'cloudy', intensity: d.cloudyIntensity! };
  if (d.borderStyle === 'dashed')
    return { kind: 'dashed', dash: d.dashArray?.length ? d.dashArray : [3, 3] };
  return { kind: 'solid' };
}

/** Engine DTO → content-space `Style` (CSS colours, `Border` union). Exported so
 *  selection-aware UIs can read display values straight off a {@link AnnotationDTO}
 *  without re-deriving the colour/border mapping. */
export function styleFromDTO(dto: AnnotationDTO): Style {
  if (dto.subtype === 'widget') {
    return {
      color: dto.color ? colorToCss(dto.color) : '#1a1a1a',
      interiorColor: dto.interiorColor ? colorToCss(dto.interiorColor) : null,
      strokeWidth: dto.strokeWidth,
      opacity: 1,
      blendMode: dto.blendMode,
      border: dto.borderStyle === 'dashed' ? { kind: 'dashed', dash: [3, 3] } : { kind: 'solid' },
    };
  }
  if (STROKE_KINDS.has(dto.subtype)) {
    const d = dto as Extract<
      AnnotationDTO,
      { interiorColor: Color | null; opacity: number; strokeWidth: number }
    >;
    return {
      color: colorToCss(d.color),
      interiorColor: d.interiorColor ? colorToCss(d.interiorColor) : null,
      strokeWidth: d.strokeWidth,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: borderFromDTO(d),
    };
  }
  if (TEXT_MARKUP.has(dto.subtype)) {
    const d = dto as Extract<AnnotationDTO, { color: Color }>;
    return {
      color: colorToCss(d.color),
      interiorColor: null,
      strokeWidth: 0,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  if (dto.subtype === 'caret') {
    const d = dto as Extract<AnnotationDTO, { color: Color; opacity: number }>;
    return {
      color: colorToCss(d.color),
      interiorColor: null,
      strokeWidth: 1,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  if (dto.subtype === 'free-text') {
    // `/DA` colour is the border + leader stroke; `/C` is the box background; `/BS`
    // gives the width. A plain text box draws no vector scene, so these only matter
    // for a callout's leader/arrow/box-border (and the style toolbar's readout).
    const d = dto as Extract<AnnotationDTO, { subtype: 'free-text' }>;
    return {
      color: colorToCss(d.color),
      interiorColor: d.interiorColor ? colorToCss(d.interiorColor) : null,
      strokeWidth: d.strokeWidth,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: borderFromDTO(d),
    };
  }
  if (dto.subtype === 'redact') {
    // `/C` is the marking-stage outline; `/IC` the fill painted on apply.
    // No `/BS` on redact — the outline weight is a client rendering choice.
    const d = dto as Extract<AnnotationDTO, { subtype: 'redact' }>;
    return {
      color: colorToCss(d.color),
      interiorColor: d.interiorColor ? colorToCss(d.interiorColor) : null,
      strokeWidth: 1.5,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  if (dto.subtype === 'text' || dto.subtype === 'file-attachment') {
    // Icon kinds: /C is the icon fill, /CA its opacity — no stroke/fill split.
    const d = dto as Extract<AnnotationDTO, { color: Color; opacity: number }>;
    return {
      color: colorToCss(d.color),
      interiorColor: null,
      strokeWidth: 1,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  return {
    color: '#444444',
    interiorColor: null,
    strokeWidth: 1,
    opacity: 1,
    blendMode: dto.blendMode,
    border: { kind: 'solid' },
  };
}

/* ── content Annot → engine draft / patch ─────────────────────────────────── */

/** The geometry styling shared by every geometric kind: `/C`, `/CA`, `/BS`
 *  (no `/IC`). Ink uses exactly this; the filled kinds add `interiorColor`. */
const geometryStyle = (style: Style) => ({
  color: cssToColor(style.color),
  strokeWidth: style.strokeWidth,
  opacity: style.opacity,
  blendMode: style.blendMode,
  // /BS /S + /BS /D — a cloudy border keeps a solid underlying stroke (the
  // scallops are the /BE effect, applied via shapeExtras).
  borderStyle: style.border.kind === 'dashed' ? ('dashed' as const) : ('solid' as const),
  ...(style.border.kind === 'dashed' ? { dashArray: style.border.dash } : {}),
});

const strokeFill = (style: Style) => ({
  ...geometryStyle(style),
  interiorColor: style.interiorColor ? cssToColor(style.interiorColor) : null,
});

/**
 * The FULL free-text styling: `/DA` colour (border + leader stroke), `/C` box
 * background, `/BS` border, `/CA` opacity, plus the font fields from the content
 * `text` projection. Emitted by every free-text draft AND patch, so a style or
 * font edit round-trips — geometry-only patches were how sidebar edits used to
 * vanish. `contents` stays out: the debounced text-edit write owns it.
 */
const freeTextStyle = (a: Annot) => {
  const t = a.text ?? initialTextStyle;
  return {
    ...strokeFill(a.style),
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    textAlign: t.textAlign,
    fontColor: cssToColor(t.fontColor),
  };
};

/**
 * Redact styling: `/C` outline + `/CA` opacity + `/IC` fill, plus the label's
 * full `/DA` triple and `/Q` (always the full triple — the engine's `/DA`
 * packing rule, same as free text). `overlayText`/`repeat` stay OUT: the label
 * text is content, written through `capability.update` (the redaction plugin's
 * `setLabel`), never through geometry/style patches.
 */
const redactStyle = (a: Annot) => {
  const t = a.text ?? initialTextStyle;
  return {
    color: cssToColor(a.style.color),
    opacity: a.style.opacity,
    interiorColor: a.style.interiorColor ? cssToColor(a.style.interiorColor) : null,
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    fontColor: cssToColor(t.fontColor),
    textAlign: t.textAlign,
  };
};

/** PDF-space bounding box of a set of `/QuadPoints` quads — the `/Rect` the
 *  redact draft must carry alongside its quads. */
type PdfPt = { x: number; y: number };
const pdfBoundsOfQuads = (quads: { p1: PdfPt; p2: PdfPt; p3: PdfPt; p4: PdfPt }[]) => {
  let left = Infinity;
  let bottom = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  for (const q of quads) {
    for (const p of [q.p1, q.p2, q.p3, q.p4]) {
      if (p.x < left) left = p.x;
      if (p.x > right) right = p.x;
      if (p.y < bottom) bottom = p.y;
      if (p.y > top) top = p.y;
    }
  }
  return { left, bottom, right, top };
};

/** Text markup carries a single `/C` colour (our model keeps stroke==fill) + `/CA`
 *  opacity. Geometry is the `/QuadPoints`, set on create and never patched. */
const markupColor = (style: Style) => ({
  color: cssToColor(style.color),
  opacity: style.opacity,
  blendMode: style.blendMode,
});

const caretStyle = (style: Style) => ({
  color: cssToColor(style.color),
  opacity: style.opacity,
  blendMode: style.blendMode,
  rectDifferences: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
});

/**
 * Cloudy-border fields for a shape (/BE intensity + /RD inset). The /Rect we send
 * is the OUTER box, and /RD tells the engine how far to inset the drawn geometry
 * so the scallops bulge back out to that box — derived, never stored on the model.
 * For a non-cloudy shape we explicitly clear both, so toggling cloudy OFF in a
 * patch removes the effect rather than leaving stale entries.
 */
function shapeExtras(a: Annot): { cloudyIntensity?: number; rectDifferences?: PdfRectDifferences } {
  if (a.geom.t === 'rect') {
    if (a.style.border.kind === 'cloudy') {
      const inset = cloudyBorderExtent(
        a.style.border.intensity,
        a.style.strokeWidth,
        a.geom.ellipse,
      );
      return {
        cloudyIntensity: a.style.border.intensity,
        rectDifferences: { left: inset, top: inset, right: inset, bottom: inset },
      };
    }
    return { cloudyIntensity: 0, rectDifferences: undefined };
  }
  // A closed poly (polygon): the curls are generated from /Vertices + /BE alone —
  // per ISO 32000 no /RD applies — and the /Rect (geomPdfBounds with the border)
  // already includes the outward cloud extent. 0 clears the effect on a patch.
  if (a.geom.t === 'poly' && a.geom.closed) {
    return { cloudyIntensity: a.style.border.kind === 'cloudy' ? a.style.border.intensity : 0 };
  }
  return {};
}

/** Inset a PdfRect by a `/RD` (PDF user space, y-up: all four are non-negative
 *  insets from the matching `/Rect` edge). Used to recover the callout text box. */
const insetPdfRectByRD = (r: PdfRect, rd?: PdfRectDifferences): PdfRect =>
  rd
    ? {
        left: r.left + rd.left,
        bottom: r.bottom + rd.bottom,
        right: r.right - rd.right,
        top: r.top - rd.top,
      }
    : r;

/**
 * The engine geometry for a callout: the overall `/Rect` (text box ∪ leader ∪
 * arrow), the `/RD` inset that recovers the text box from it, the `/CL` leader
 * (`[tip, knee, conn]` with the connection point derived), and the `/LE` ending.
 * All in PDF user space (y-up), with every `/RD` inset clamped non-negative.
 *
 * A tilted box (the upright policy) additionally emits `rotation` +
 * `unrotatedRect` (the logical text box) — the engine bakes the box + text
 * under an INLINE rotation about the box centre while the leader stays
 * page-space, so (unlike plain boxes) the /AP form `/Matrix` stays identity and
 * the raster stays placed by `/Rect`. `/RD` then insets to the ROTATED box's
 * AABB — the best axis-aligned text box a foreign viewer regenerating the AP
 * can draw (spec-conformant degradation).
 */
function calloutFields(
  a: Annot,
  crop: PdfRect,
): {
  rect: PdfRect;
  rectDifferences: PdfRectDifferences;
  calloutLine: CalloutLine;
  lineEnding: LineEnding;
  rotation?: number;
  unrotatedRect?: PdfRect;
} | null {
  const g = a.geom;
  if (g.t !== 'text' || !g.callout) return null;
  const rot = geomRotation(g);
  const overall = geomPdfBounds(g, a.style.strokeWidth, crop);
  const tb = contentToPdfRect(rot ? rotatedAabb(g.rect, rot) : g.rect, crop);
  const nn = (n: number) => Math.max(0, n);
  const pts = calloutLinePoints(g).map((p) => contentToPdfPoint(p, crop));
  const calloutLine = (
    pts.length === 3 ? [pts[0], pts[1], pts[2]] : [pts[0], pts[1]]
  ) as CalloutLine;
  return {
    rect: overall,
    rectDifferences: {
      left: nn(tb.left - overall.left),
      bottom: nn(tb.bottom - overall.bottom),
      right: nn(overall.right - tb.right),
      top: nn(overall.top - tb.top),
    },
    calloutLine,
    lineEnding: g.callout.ending,
    ...(rot ? { rotation: toPdfRotation(rot), unrotatedRect: contentToPdfRect(g.rect, crop) } : {}),
  };
}

type GeomFields =
  | { rect: PdfRect }
  | { linePoints: LinePoints; lineEndings: LineEndings | undefined; rect: PdfRect }
  | { vertices: PdfPoint[]; lineEndings: LineEndings | undefined; rect: PdfRect }
  | { inkList: InkList; rect: PdfRect };

function geomFields(a: Annot, crop: PdfRect): GeomFields | null {
  const g = a.geom;
  const sw = a.style.strokeWidth;
  // /Rect IS `g.rect` (the outer box) for every shape; a cloudy border's geometry is
  // inset from it by /RD (see shapeExtras), and the scallops fill back out to it.
  if (g.t === 'rect' || g.t === 'text' || g.t === 'caret')
    return { rect: contentToPdfRect(g.rect, crop) };
  if (g.t === 'line') {
    return {
      linePoints: { start: contentToPdfPoint(g.a, crop), end: contentToPdfPoint(g.b, crop) },
      lineEndings: g.ends,
      // VISUAL bounds (stroke + endings) — the engine clips the baked /AP to /Rect.
      rect: geomPdfBounds(g, sw, crop),
    };
  }
  if (g.t === 'poly') {
    return {
      vertices: g.points.map((p) => contentToPdfPoint(p, crop)),
      lineEndings: g.ends,
      // border matters here: a cloudy polygon's curls reach OUTWARD beyond the
      // vertices, and the /Rect must enclose them or the baked /AP clips.
      rect: geomPdfBounds(g, sw, crop, a.style.border),
    };
  }
  if (g.t === 'ink') {
    return {
      inkList: g.strokes.map((stroke) => stroke.map((p) => contentToPdfPoint(p, crop))),
      // VISUAL bounds (stroke radius incl.) — the engine clips the baked /AP to /Rect.
      rect: geomPdfBounds(g, sw, crop),
    };
  }
  return null; // quads (markup) — built separately via quadPointsFor
}

/** Markup geometry: content-space quads → engine `/QuadPoints` (PDF user space).
 *  Kept out of `geomFields` so that union stays rect/line/poly and its `'rect' in f`
 *  narrowing is unaffected. */
function quadPointsFor(a: Annot, crop: PdfRect) {
  if (a.geom.t !== 'quads') return null;
  return a.geom.quads.map((q) => ({
    p1: contentToPdfPoint(q[0], crop),
    p2: contentToPdfPoint(q[1], crop),
    p3: contentToPdfPoint(q[2], crop),
    p4: contentToPdfPoint(q[3], crop),
  }));
}

/** Box geometry+rotation fields for the emit side (square/circle/plain free-text):
 *  the model's unrotated `rect` + applied `rot`, mapped to `/Rect`(+`unrotatedRect`
 *  +`rotation`). The geom is always a box here (the callers gate on subtype). */
const boxEmit = (a: Annot, crop: PdfRect) => {
  const g = a.geom as Extract<Geom, { t: 'rect' } | { t: 'text' }>;
  return boxGeomFields(g.rect, geomRotation(a.geom), crop);
};

/** Content Annot → engine create draft (square/circle/line in v1; null otherwise). */
export function toCreateDraft(a: Annot, crop: PdfRect): AnnotationDraft | null {
  const draft = baseCreateDraft(a, crop);
  // Emit the model's `/F` verbatim, once, for every kind: a fresh draw carries
  // DRAWN_FLAGS (print — Acrobat parity) plus any tool seed. Create starts
  // from `/F 0`, so the full set writes exactly these bits.
  return draft ? ({ ...draft, flags: a.flags } as AnnotationDraft) : null;
}

function baseCreateDraft(a: Annot, crop: PdfRect): AnnotationDraft | null {
  const f = geomFields(a, crop);
  const sf = strokeFill(a.style);
  if (a.subtype === 'square' && f && 'rect' in f)
    return { subtype: 'square', ...boxEmit(a, crop), ...sf, ...shapeExtras(a) };
  if (a.subtype === 'circle' && f && 'rect' in f)
    return { subtype: 'circle', ...boxEmit(a, crop), ...sf, ...shapeExtras(a) };
  if (a.subtype === 'line' && f && 'linePoints' in f)
    return {
      subtype: 'line',
      linePoints: f.linePoints,
      lineEndings: f.lineEndings,
      rect: f.rect,
      ...sf,
      ...advisoryRotation(a.geom),
    };
  if (a.subtype === 'polygon' && f && 'vertices' in f)
    return {
      subtype: 'polygon',
      vertices: f.vertices,
      rect: f.rect,
      ...sf,
      ...shapeExtras(a),
      ...advisoryRotation(a.geom),
    };
  if (a.subtype === 'polyline' && f && 'vertices' in f)
    return {
      subtype: 'polyline',
      vertices: f.vertices,
      lineEndings: f.lineEndings,
      rect: f.rect,
      ...sf,
      ...advisoryRotation(a.geom),
    };
  if (a.subtype === 'ink' && f && 'inkList' in f)
    return {
      subtype: 'ink',
      ...(a.intent === 'ink-highlight' ? { intent: a.intent } : {}),
      inkList: f.inkList,
      rect: f.rect,
      ...geometryStyle(a.style),
      ...advisoryRotation(a.geom),
    };
  if (a.subtype === 'free-text' && f && 'rect' in f) {
    // The full style+font set (from the content `text` projection — seeded from
    // the tool defaults at draw time) plus the initial contents.
    const text = { ...freeTextStyle(a), contents: a.data?.contents ?? '' };
    const cf = calloutFields(a, crop);
    if (cf)
      return {
        subtype: 'free-text',
        intent: 'free-text-callout',
        rect: cf.rect, // overall /Rect (box ∪ leader ∪ arrow)
        rectDifferences: cf.rectDifferences,
        calloutLine: cf.calloutLine,
        lineEnding: cf.lineEnding,
        // Upright tilt of the text BOX (leader stays page-space) — absent at rot 0.
        ...(cf.rotation !== undefined
          ? { rotation: cf.rotation, unrotatedRect: cf.unrotatedRect }
          : {}),
        ...text,
      } as AnnotationDraft;
    return {
      subtype: 'free-text',
      intent: 'free-text',
      ...boxEmit(a, crop),
      ...text,
    } as AnnotationDraft;
  }
  if (a.subtype === 'caret' && f && 'rect' in f)
    return {
      subtype: 'caret',
      rect: f.rect,
      ...caretStyle(a.style),
      // `/F` rides the wrapper (`toCreateDraft`) for every kind — the old
      // replace-text-only `print` special case is covered by DRAWN_FLAGS.
      ...(a.intent === 'replace' ? { intent: a.intent } : {}),
      ...(a.data?.contents != null ? { contents: a.data.contents } : {}),
    };
  if (a.subtype === 'redact') {
    // Text redaction: quads + their PDF bounding box as `/Rect` (the engine
    // requires an explicit rect). Area redaction: rect only — `/Rect` IS the
    // removal region.
    const redactQuads = quadPointsFor(a, crop);
    if (redactQuads)
      return {
        subtype: 'redact',
        rect: pdfBoundsOfQuads(redactQuads),
        quadPoints: redactQuads,
        ...redactStyle(a),
      } as AnnotationDraft;
    if (f && 'rect' in f)
      return { subtype: 'redact', rect: f.rect, ...redactStyle(a) } as AnnotationDraft;
    return null;
  }
  const quads = quadPointsFor(a, crop);
  if (TEXT_MARKUP.has(a.subtype) && quads)
    return {
      subtype: a.subtype,
      quadPoints: quads,
      ...markupColor(a.style),
      ...(a.subtype === 'strikeout' && a.intent === 'strikeout-text-edit'
        ? { intent: a.intent }
        : {}),
    } as AnnotationDraft;
  return null;
}

/** Content Annot → engine geometry+style patch (all editable kinds). */
export function toPatch(a: Annot, crop: PdfRect): AnnotationPatch | null {
  const f = geomFields(a, crop);
  const sf = strokeFill(a.style);
  if (a.subtype.startsWith('widget') && f && 'rect' in f) {
    return {
      subtype: 'widget',
      rect: f.rect,
      color: cssToColor(a.style.color),
      interiorColor: a.style.interiorColor ? cssToColor(a.style.interiorColor) : null,
      strokeWidth: a.style.strokeWidth,
      borderStyle: a.style.border.kind === 'dashed' ? 'dashed' : 'solid',
      ...(a.text
        ? {
            fontFamily: a.text.fontFamily as StandardFont,
            fontSize: a.text.fontSize,
            fontColor: cssToColor(a.text.fontColor),
            textAlign: a.text.textAlign,
          }
        : {}),
    };
  }
  if (a.subtype === 'square' && f && 'rect' in f)
    return { subtype: 'square', ...boxEmit(a, crop), ...sf, ...shapeExtras(a) };
  if (a.subtype === 'circle' && f && 'rect' in f)
    return { subtype: 'circle', ...boxEmit(a, crop), ...sf, ...shapeExtras(a) };
  if (a.subtype === 'line' && f && 'linePoints' in f)
    return {
      subtype: 'line',
      linePoints: f.linePoints,
      lineEndings: f.lineEndings,
      rect: f.rect,
      ...sf,
      ...advisoryRotation(a.geom),
    };
  if (a.subtype === 'polygon' && f && 'vertices' in f)
    return {
      subtype: 'polygon',
      vertices: f.vertices,
      rect: f.rect,
      ...sf,
      ...shapeExtras(a),
      ...advisoryRotation(a.geom),
    };
  if (a.subtype === 'polyline' && f && 'vertices' in f)
    return {
      subtype: 'polyline',
      vertices: f.vertices,
      lineEndings: f.lineEndings,
      rect: f.rect,
      ...sf,
      ...advisoryRotation(a.geom),
    };
  if (a.subtype === 'ink' && f && 'inkList' in f)
    return {
      subtype: 'ink',
      ...(a.intent === 'ink-highlight' ? { intent: a.intent } : {}),
      inkList: f.inkList,
      rect: f.rect,
      ...geometryStyle(a.style),
      ...advisoryRotation(a.geom),
    };
  // free-text: geometry + the full style/font set (see `freeTextStyle`) — one
  // complete patch whether the edit was a move, a restyle, or a font change.
  // Text content is committed separately (the debounced `update(contents)`
  // while typing), so it's never duplicated here. A callout sends the overall
  // /Rect + the leader (/CL, /RD, /LE), so box, tip, and knee all round-trip.
  if (a.subtype === 'free-text' && f && 'rect' in f) {
    const cf = calloutFields(a, crop);
    if (cf)
      return {
        subtype: 'free-text',
        rect: cf.rect,
        rectDifferences: cf.rectDifferences,
        calloutLine: cf.calloutLine,
        lineEnding: cf.lineEnding,
        // Upright tilt of the text BOX (leader stays page-space) — absent at rot 0.
        ...(cf.rotation !== undefined
          ? { rotation: cf.rotation, unrotatedRect: cf.unrotatedRect }
          : {}),
        ...freeTextStyle(a),
      } as AnnotationPatch;
    return { subtype: 'free-text', ...boxEmit(a, crop), ...freeTextStyle(a) } as AnnotationPatch;
  }
  if (a.subtype === 'caret' && f && 'rect' in f)
    return {
      subtype: 'caret',
      rect: f.rect,
      ...caretStyle(a.style),
      ...(a.intent === 'replace' ? { intent: a.intent } : {}),
    };
  // icon kinds (note / file attachment): geometry (a move) + /C + /CA +
  // /Name — the engine re-bakes the fixed-size icon /AP from these. The
  // attached file is create-only and never rides a patch.
  if ((a.subtype === 'text' || a.subtype === 'file-attachment') && f && 'rect' in f)
    return {
      subtype: a.subtype,
      rect: f.rect,
      color: cssToColor(a.style.color),
      opacity: a.style.opacity,
      ...(a.icon !== undefined ? { icon: a.icon } : {}),
    } as AnnotationPatch;
  // stamp: geometry only — the visual is the engine-baked /AP, re-fit natively
  // when /Rect changes. Content replacement carries bytes and goes through
  // `capability.update` with an inline `source`, never through this path.
  if (a.subtype === 'stamp' && f && 'rect' in f) return { subtype: 'stamp', ...boxEmit(a, crop) };
  // redact: an AREA mark's box moves/resizes; a text mark's /QuadPoints are
  // set at create and never patched (text-bound, like markup). Style + the
  // label's /DA styling always ride so sidebar edits round-trip; the label
  // TEXT itself rides `capability.update` (setLabel), never this path.
  if (a.subtype === 'redact') {
    if (a.geom.t === 'rect' && f && 'rect' in f)
      return { subtype: 'redact', rect: f.rect, ...redactStyle(a) } as AnnotationPatch;
    return { subtype: 'redact', ...redactStyle(a) } as AnnotationPatch;
  }
  // markup: recolor / opacity only — /QuadPoints geometry isn't edited after create
  if (TEXT_MARKUP.has(a.subtype))
    return {
      subtype: a.subtype,
      ...markupColor(a.style),
      ...(a.subtype === 'strikeout' && a.intent === 'strikeout-text-edit'
        ? { intent: a.intent }
        : {}),
    } as AnnotationPatch;
  return null;
}
