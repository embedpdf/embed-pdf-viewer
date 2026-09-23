/**
 * The React view of @embedpdf/plugin-annotation.
 *
 * Pure paint: it reads the per-page render items + chrome and draws them. Pointer
 * events arrive through the interaction hub (the Stage's forwarding), and the
 * cursor is driven by the hub too (the edit handler claims move/pointer/resize on
 * hover). Each annotation resolves to one native node — a vector SceneSvg, the
 * engine's baked /AP <img>, or a registered behavior — and the host
 * `customRenderer` may wrap or replace it.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-annotation';
import type { EventHook, ResourceStatus } from '@embedpdf/core';
import {
  scene,
  MITER_LIMIT,
  pdfToContentRect,
  type AnnotationProps,
  type Paint,
  type Rect,
  type RenderItem,
} from '@embedpdf/core-annotation';
import {
  AnnotationToken,
  annotationKey,
  type Annotation,
  type AnnotationCapability,
  type AnnotationFilter,
  type AnnotationRef,
  type Behavior,
  type CommentsApi,
  type CommentThread,
  type SelectionFlags,
  type SelectionProps,
  type FilePickerProvider,
  type TextItem,
} from '@embedpdf/plugin-annotation';
import {
  AnnotationToken as AnnotationHostToken,
  previewBucket,
} from '@embedpdf/plugin-annotation/contract/host';
import {
  attachRichTextEditor,
  pickFile,
  type RichTextEditorBinding,
  type RichTextEditorHost,
} from '@embedpdf/web';
// The render layer is framework code, so it resolves the full host lens
// (pageItems/chrome/appearances/…). Same runtime token as the public one — only
// the type differs. App code never imports this.
import { useEffect, useRef, useState } from 'react';
import * as React from 'react';

export type {
  CreationDraftAnchor,
  RenderItem,
  LineEnding,
  LineEndings,
  Border,
  Style,
  AnnotationFlags,
  AnnotationProps,
  AnnotationPropsPatch,
  PropKey,
  PropSpec,
  TextAlign,
  TextStyle,
} from '@embedpdf/core-annotation';
export type { SelectionFlags, SelectionProps } from '@embedpdf/plugin-annotation';
import { devWarn } from './dev';
import { usePageLayerFact } from './dev-registry';
import {
  shallowArray,
  useCapability,
  useCapabilityEvent,
  useDocumentId,
  useKernelValue,
  useOptionalCapability,
  usePage,
  useSelector,
} from './runtime';
import type { PageContextValue, PageLayout } from './runtime';

export {
  sameAnchor,
  sameCreationDraftAnchor,
  type AnnotationSelectionAnchor,
} from './annotation-anchors';
export { useAnnotationSelected } from './annotation-hooks';

/** `#rrggbb` → `rgba(...)` — the marquee's translucent fill derives from the
 *  accent, so one `setChrome({ accent })` restyles every piece of chrome. */
const rgba = (hex: string, alpha: number): string => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const rgb = parseInt(match[1], 16);
  return `rgba(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255},${alpha})`;
};

/**
 * What an annotation renderer receives: the projected item (its `box` is live —
 * it follows drags), the page context, the engine's baked /AP raster (the
 * "picture"), the default visual (`native` — wrap it or ignore it), and
 * whether this entry currently owns the pointer (`interactive`). While not
 * interactive the layer renders your component pointer-locked: the annotation
 * stays a first-class citizen of the annotation plane (select/move/resize).
 */
export interface AnnotationRendererProps {
  item: RenderItem;
  page: PageContextValue;
  appearance: { url: string; box: Rect } | null;
  native: React.ReactNode;
  interactive: boolean;
}

/**
 * One rule: "for these annotations, render this component, and it owns the
 * pointer when …". The two shapes:
 *
 *   - `{ for, component, interactive? }` — your own rule. Without
 *     `interactive` it is a pure skin: pixels only, mechanically
 *     pointer-locked, the annotation plane keeps selection/move/resize. With
 *     `interactive` (boolean or live predicate) the layer registers a plugin
 *     Behavior for you: while it holds, the annotation plane stands down
 *     (hit-test-inert) and your component owns the input.
 *   - `{ behavior, component }` — the renderer for a plugin-registered
 *     behavior (the form plugin's fill controls via `formWidgetRenderer`);
 *     the plugin decides engagement, never the app.
 *
 * Resolution: ownership beats skin — an engaged behavior's component is
 * authoritative; `for` rules apply only to plane-owned annotations, first
 * match wins. Define entries outside render (module scope or useMemo): entry
 * identity keys the behavior registration.
 */
export type AnnotationRenderer =
  | { behavior: string; component: React.ComponentType<AnnotationRendererProps> }
  | {
      /** Stable id for the auto-registered behavior (optional; generated). */
      id?: string;
      for: Behavior['matches'];
      component: React.ComponentType<AnnotationRendererProps>;
      interactive?: boolean | (() => boolean);
    };

export interface AnnotationLayerProps {
  /** Annotation renderers — skins and interactive takeovers ({@link AnnotationRenderer}). */
  renderers?: AnnotationRenderer[];
}

/** Content rect → a view-px box (the page wrapper's own coordinate space). */
function boxOf(rect: Rect, page: PageContextValue) {
  const tl = page.transform.toPixels({ x: rect.x, y: rect.y });
  const br = page.transform.toPixels({ x: rect.x + rect.width, y: rect.y + rect.height });
  return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y };
}

/** Map a core `Paint` to SVG presentation attributes — the whole framework-facing
 *  surface. Everything else about appearance is decided in the core's `scene`. */
function paintAttrs(paint: Paint) {
  return {
    fill: paint.fill ?? 'none',
    stroke: paint.stroke ?? 'none',
    strokeWidth: paint.width,
    opacity: paint.opacity,
    strokeLinejoin: paint.join ?? ('miter' as const), // undefined → sharp miter; 'round' only for ink
    strokeMiterlimit: MITER_LIMIT, // must match the bounds math so spike vs bevel agree
    strokeLinecap: paint.lineCap, // undefined → SVG default (butt); 'round' only for ink
    strokeDasharray: paint.dash ? paint.dash.join(' ') : undefined,
    ...(paint.blend ? { style: { mixBlendMode: paint.blend } } : {}),
  };
}

/**
 * The dumb painter. The pure core computed `item.box` and the painted `scene`; we
 * size the <svg> to the box with a content-space `viewBox` and map each SceneNode
 * to one element, applying its `paint`. No per-kind logic, no bounds math — so
 * shapes, cloudy borders and every text-markup type all render here, and a Vue /
 * Svelte painter is the same ~10-line loop.
 */
function Shape({ item, page }: { item: RenderItem; page: PageContextValue }) {
  // Nothing to draw until the annotation has area (the 0×0 draft at mouse-down).
  if (item.box.width <= 0 || item.box.height <= 0) return null;
  const { left, top, width, height } = boxOf(item.box, page);
  // The viewBox (content units) and the <svg> on-screen size must stay proportional
  // (scale == zoom). Clamping either — e.g. a `max(1px)` floor on the element while
  // the viewBox keeps shrinking — decouples them, so a sub-pixel box scales content
  // up by ~1/size and a cloudy border's scallops flood the stage. No clamps here.
  const vb = `${item.box.x} ${item.box.y} ${item.box.width} ${item.box.height}`;
  // Box-family kinds (square/circle, caret) carry an unrotated `box` + a `rot`
  // angle; rotate the whole <svg> about its centre. Vertex kinds (line/poly/ink)
  // are already rotated in their geometry, so `rot` is advisory there — never
  // re-applied.
  const rot = item.geometry.kind === 'rect' || item.geometry.kind === 'caret' ? (item.rot ?? 0) : 0;
  return (
    <svg
      viewBox={vb}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        overflow: 'visible',
        pointerEvents: 'none',
        ...(rot ? { transform: `rotate(${rot}deg)`, transformOrigin: 'center' } : {}),
      }}
    >
      {sceneNodes(item)}
    </svg>
  );
}

/** Map a core scene to SVG children. */
function sceneNodes(item: RenderItem): React.ReactNode[] {
  return scene(item).map((node, i) => {
    const attributes = paintAttrs(node.paint);
    if (node.kind === 'rect')
      return (
        <rect
          key={i}
          x={node.rect.x}
          y={node.rect.y}
          width={node.rect.width}
          height={node.rect.height}
          {...attributes}
        />
      );
    if (node.kind === 'ellipse')
      return (
        <ellipse
          key={i}
          cx={node.rect.x + node.rect.width / 2}
          cy={node.rect.y + node.rect.height / 2}
          rx={node.rect.width / 2}
          ry={node.rect.height / 2}
          {...attributes}
        />
      );
    if (node.kind === 'line')
      return (
        <line key={i} x1={node.a.x} y1={node.a.y} x2={node.b.x} y2={node.b.y} {...attributes} />
      );
    if (node.kind === 'path') return <path key={i} d={node.d} {...attributes} />;
    if (node.kind === 'text')
      return (
        <text
          key={i}
          x={node.at.x}
          y={node.at.y}
          transform={
            node.rotation ? `rotate(${node.rotation} ${node.at.x} ${node.at.y})` : undefined
          }
          fontSize={node.fontSize}
          {...(node.fontFamily ? { fontFamily: node.fontFamily } : {})}
          {...attributes}
        >
          {node.text}
        </text>
      );
    const svgPoints = node.points.map((point) => `${point.x},${point.y}`).join(' ');
    return node.closed ? (
      <polygon key={i} points={svgPoints} {...attributes} />
    ) : (
      <polyline key={i} points={svgPoints} {...attributes} />
    );
  });
}

function BakedImage({
  box,
  url,
  page,
  blend,
  rot,
}: {
  box: Rect;
  url: string;
  page: PageContextValue;
  blend?: Paint['blend'];
  /** The rotation (deg, CW) the engine stripped from this raster
   *  (`RenderItem.apRot`) — re-applied here as a view transform, so a live
   *  rotate gesture spins the bitmap with zero engine re-renders. Unset for
   *  rasters that already contain their rotation (vertex kinds). */
  rot?: number;
}) {
  const frame = boxOf(box, page);
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: frame.left,
        top: frame.top,
        width: frame.width,
        height: frame.height,
        // The AP box is sized in content units; a global `img { max-width: 100% }`
        // reset would otherwise clamp it to the containing block and distort the
        // aspect. This bites specifically when the box is wider than that block —
        // a landscape stamp whose unrotated box overhangs a view-rotated (portrait)
        // page — so honour the explicit size and let `rot` place it.
        maxWidth: 'none',
        maxHeight: 'none',
        pointerEvents: 'none',
        mixBlendMode: blend,
        // Same CW convention as the free-text element: rotate about the centre.
        ...(rot ? { transform: `rotate(${rot}deg)`, transformOrigin: 'center' } : {}),
      }}
    />
  );
}

/**
 * The armed stamp's image footprint ghost: a translucent render of the payload
 * drawn in the exact box a click would place it (the plugin computes it with
 * the same fit + clamp as placement). Vector footprint ghosts never reach this
 * component — they ride `pageItems` like every draft preview. The preview
 * bytes live in the capability closure; this layer owns only the object-URL
 * lifetime, keyed on the armed stamp — a new arm swaps the image, a disarm (or
 * tool change) drops it.
 */
function ToolGhostImage({ page }: { page: PageContextValue }) {
  const anno = useCapability(AnnotationHostToken);
  const ghost = useSelector(AnnotationHostToken, (annotation) => annotation.getToolGhost(page.ref));
  const armed = useSelector(AnnotationHostToken, (annotation) => annotation.getArmedStamp());
  const [url, setUrl] = useState<string | null>(null);
  // The ghost is a bitmap of vector artwork, right at one size: ask for the
  // bucket that covers the box's device width (points × device px per point),
  // so it stays sharp at every zoom and density. The plugin caches per bucket.
  const bucket =
    ghost?.kind === 'image' ? previewBucket(ghost.box.width * page.transform.renderScale) : 0;

  useEffect(() => {
    if (!bucket) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let obj: string | null = null;
    void anno.renderArmedStampPreview(bucket).then((preview) => {
      if (cancelled || !preview) return;
      // Copy into an exact ArrayBuffer (the engine idiom): a Uint8Array view
      // may sit on a larger or shared buffer, which Blob won't accept.
      const body = new ArrayBuffer(preview.bytes.byteLength);
      new Uint8Array(body).set(preview.bytes);
      const blob = new Blob([body], preview.mimeType ? { type: preview.mimeType } : {});
      obj = URL.createObjectURL(blob);
      // The previous bucket's image stays up until this one resolves — no
      // flicker while a zoom crosses a bucket boundary.
      setUrl(obj);
    });
    return () => {
      cancelled = true;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [anno, armed, bucket]);

  if (!ghost || ghost.kind !== 'image' || !url) return null;
  const frame = boxOf(ghost.box, page);
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: frame.left,
        top: frame.top,
        width: frame.width,
        height: frame.height,
        // Same explicit-size rule as BakedImage: never let a global img reset
        // clamp the box and distort the aspect.
        maxWidth: 'none',
        maxHeight: 'none',
        pointerEvents: 'none',
        opacity: 0.5,
        ...(ghost.rot ? { transform: `rotate(${ghost.rot}deg)`, transformOrigin: 'center' } : {}),
      }}
    />
  );
}

function Chrome({ page }: { page: PageContextValue }) {
  // The page's view scale converts the CSS-px chrome settings into content
  // units inside the core (knob stalk, grab zones) — screen-constant at every
  // zoom. The painter's own px values (handle glyphs, dot radius) are drawn in
  // screen space and need no conversion.
  const scale = page.transform.viewScale;
  const rotation = page.transform.rotation;
  const zoom = page.transform.zoom;
  const nodes = useSelector(
    AnnotationHostToken,
    (annotation) => annotation.listChromeNodes(page.ref, scale, rotation, zoom),
    shallowArray,
  );
  const cs = useSelector(AnnotationHostToken, (annotation) => annotation.getChromeSettings());
  // The accent cascade: each piece's color falls back to the one accent.
  const outlineStroke = cs.outline.color ?? cs.accent;
  const handleStroke = cs.handles.stroke ?? cs.accent;
  const knobStroke = cs.knob.stroke ?? cs.accent;
  // One outline style for the resting rect and the rotated obb — the selection
  // box must never flip dashed↔solid when a rotation starts.
  const outlineDash = cs.outline.style === 'dashed' ? '4 3' : undefined;
  // The live rotation readout — an HTML chip (rounded box + padded text beats
  // hand-rolling it in SVG), riding the pointer.
  const chip = nodes.find((node) => node.kind === 'angle-chip');
  const chipAt = chip ? page.transform.toPixels(chip.at) : null;
  return (
    <>
      <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {nodes.map((node, i) => {
          if (node.kind === 'angle-chip') return null; // rendered as HTML below
          if (node.kind === 'handle') {
            const point = page.transform.toPixels(node.at);
            const hs = cs.handles.size;
            return (
              <rect
                key={i}
                x={point.x - hs / 2}
                y={point.y - hs / 2}
                width={hs}
                height={hs}
                fill={cs.handles.fill}
                stroke={handleStroke}
                strokeWidth={1.5}
                // The square rides a rotated box's orientation (spin about itself).
                {...(node.rot ? { transform: `rotate(${node.rot} ${point.x} ${point.y})` } : {})}
              />
            );
          }
          // A live alignment guide of a snapped move: a through-line at the snapped
          // edge/center, spanning both shapes.
          if (node.kind === 'guide') {
            const start = page.transform.toPixels(
              node.axis === 'x' ? { x: node.at, y: node.lo } : { x: node.lo, y: node.at },
            );
            const end = page.transform.toPixels(
              node.axis === 'x' ? { x: node.at, y: node.hi } : { x: node.hi, y: node.at },
            );
            return (
              <line
                key={i}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="#e91e63"
                strokeWidth={1.5}
                shapeRendering="crispEdges"
              />
            );
          }
          // An oriented selection box (a tilted shape/group): a closed quad through
          // the four content-space corners — replaces the axis-aligned outline.
          if (node.kind === 'obb') {
            const svgPoints = node.corners
              .map((point) => {
                const pixel = page.transform.toPixels(point);
                return `${pixel.x},${pixel.y}`;
              })
              .join(' ');
            return (
              <polygon
                key={i}
                points={svgPoints}
                fill="none"
                stroke={outlineStroke}
                strokeWidth={cs.outline.width}
                strokeDasharray={outlineDash}
              />
            );
          }
          // Rotation guides (live rotate only): the faint 0°/90° reference cross
          // + the prominent indicator riding the angle — pre-cut page chords, so
          // this is a dumb line loop.
          if (node.kind === 'rotate-guides') {
            const guideDash = cs.guides.style === 'dashed' ? '4 3' : undefined;
            return (
              <g key={i}>
                {node.lines.map((chord, j) => {
                  const start = page.transform.toPixels(chord.a);
                  const end = page.transform.toPixels(chord.b);
                  const axis = chord.role === 'axis';
                  return (
                    <line
                      key={j}
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                      stroke={
                        axis
                          ? (cs.guides.axisColor ?? cs.accent)
                          : (cs.guides.indicatorColor ?? cs.accent)
                      }
                      opacity={axis ? cs.guides.axisOpacity : cs.guides.indicatorOpacity}
                      strokeWidth={cs.guides.width}
                      strokeDasharray={guideDash}
                    />
                  );
                })}
              </g>
            );
          }
          // The rotate knob: a stalk from the top-edge midpoint out to a grab dot.
          if (node.kind === 'rotate-knob') {
            const at = page.transform.toPixels(node.at);
            const from = page.transform.toPixels(node.from);
            return (
              <g key={i}>
                {cs.knob.stalk && (
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={at.x}
                    y2={at.y}
                    stroke={knobStroke}
                    strokeWidth={1}
                  />
                )}
                <circle
                  cx={at.x}
                  cy={at.y}
                  r={cs.knob.size / 2}
                  fill={cs.knob.fill}
                  stroke={knobStroke}
                  strokeWidth={1.5}
                />
              </g>
            );
          }
          const frame = boxOf(node.rect, page);
          // The marquee rubber band keeps its own look (translucent accent fill,
          // always dashed); the selection outline follows the settings.
          if (node.kind === 'marquee') {
            return (
              <rect
                key={i}
                x={frame.left}
                y={frame.top}
                width={frame.width}
                height={frame.height}
                fill={rgba(cs.accent, 0.08)}
                stroke={cs.accent}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            );
          }
          return (
            <rect
              key={i}
              x={frame.left}
              y={frame.top}
              width={frame.width}
              height={frame.height}
              fill="none"
              stroke={outlineStroke}
              strokeWidth={cs.outline.width}
              strokeDasharray={outlineDash}
            />
          );
        })}
      </svg>
      {chip && chipAt && (
        <div
          style={{
            position: 'absolute',
            left: chipAt.x + 16,
            top: chipAt.y - 28,
            background: 'rgba(0,0,0,0.8)',
            color: '#fff',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 1,
          }}
        >
          {chip.angle}°
        </div>
      )}
    </>
  );
}

/**
 * A free-text annotation: the same styled element for viewing and editing —
 * `contentEditable` just toggles, so the text never jumps. The plugin handed us
 * a ready-to-spread body style (`item.css`) and the rich paragraphs
 * (`item.richText`); the shared `attachRichTextEditor` binding renders them
 * as inline-styled spans, serialises typing back, maps the selection to flat
 * offsets and keeps the caret through a restyle; the browser owns layout,
 * caret, IME and clipboard; the plugin owns the text truth, the range
 * routing and the debounced engine write. This component is the entire
 * per-framework surface for text editing — React's part is the glue below.
 */
function FreeText({ item, page }: { item: TextItem; page: PageContextValue }) {
  const anno = useCapability(AnnotationHostToken);
  const ref = React.useRef<HTMLDivElement>(null);
  const box = boxOf(item.box, page);
  const scale = item.box.width > 0 ? box.width / item.box.width : 1; // content units → screen px
  // The binding outlives renders; the host closes over the latest item.
  const binding = React.useRef<RichTextEditorBinding | null>(null);
  const latest = React.useRef({ item, scale });
  latest.current = { item, scale };
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const host: RichTextEditorHost = {
      // Typing shows at once and reaches the engine in one write after a
      // pause (or when the edit ends), not one write per keystroke.
      onInput: (doc) => {
        const it = latest.current.item;
        if (it.ref) anno.draftRichText(it.ref, doc);
      },
      onSelectionChange: (range) => {
        const it = latest.current.item;
        if (it.ref) anno.setTextSelection(it.ref, range);
      },
      onCommand: (command) => anno.toggleTextFormat(command),
      cssFontFamily: (family) => anno.getCssFontFamily(family),
    };
    const editorBinding = attachRichTextEditor(element, host, {
      document: latest.current.item.richText,
      scale: latest.current.scale,
    });
    binding.current = editorBinding;
    return () => {
      editorBinding.detach();
      binding.current = null;
    };
  }, [anno]);
  // Model → DOM: the binding skips its own echo (so the caret never jumps
  // while typing) and re-renders — caret restored — for a restyle, a remote
  // edit, or a zoom.
  // Runs on every item change: the binding re-renders only when the document
  // differs, and otherwise just re-states the line model for the element's
  // (possibly restyled) font.
  useEffect(() => {
    binding.current?.update({ document: item.richText, scale });
  }, [item, scale]);
  // The element is the engine's text plate (`SetPlateRect` + its `re W n`
  // clip): positioned at the padding inset with zero CSS padding, so the
  // scrollport's edge is the plate edge. CSS padding does not clip overflow —
  // scrolled lines slide straight through it and paint over the border band —
  // so the border band must sit outside the scrollport, never inside it.
  const pad = item.css.padding * scale;
  const plate = {
    left: box.left + pad,
    top: box.top + pad,
    width: Math.max(0, box.width - 2 * pad),
    height: Math.max(0, box.height - 2 * pad),
  };

  // Keep DOM focus in sync with the model's `editing` state. Focus follows the
  // model — it never drives it (exit is hub-driven, see the edit handler), so a
  // transient focus-steal by the page surface can't end the edit.
  useEffect(() => {
    if (item.editing) {
      const element = ref.current;
      if (!element) return;
      element.focus();
      // Enter at the top — the same anchoring the baked appearance uses
      // (/Q vertical-align top), so baked → edit → baked never jumps. The
      // browser still follows the caret once the user clicks or types.
      element.scrollTop = 0;
    }
  }, [item.editing]);

  // Isolate the editor from the interaction hub: a pointerdown inside it must not
  // bubble up to the Stage's native listener (which the edit handler reads as a
  // click-outside → exit). Stopping it here lets the browser own caret placement
  // and drag-selection inside the box, while clicks outside still reach the hub and
  // commit the edit. Native listener (not React's) so it runs during real DOM
  // bubbling, before the Stage's own native listener on an ancestor.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const stop = (event: Event) => event.stopPropagation();
    element.addEventListener('pointerdown', stop);
    return () => element.removeEventListener('pointerdown', stop);
  }, []);

  return (
    <div
      ref={ref}
      contentEditable={item.editing}
      suppressContentEditableWarning
      onBlur={(event) => {
        // The gesture that opens the editor fires a native `mousedown` on the
        // non-focusable page surface, which blurs us to <body> (relatedTarget null)
        // right after we focus. If the model still has this box in edit, that blur
        // is a spurious steal — re-assert focus. A real click-away routes through
        // the hub, which clears `editing` before this fires, so we let it go (and a
        // focus move to a real element, relatedTarget != null, is always honoured).
        if (
          event.relatedTarget == null &&
          ref.current?.isConnected &&
          anno.getEditingId() === item.id
        ) {
          ref.current.focus();
        }
      }}
      style={{
        position: 'absolute',
        left: plate.left,
        top: plate.top,
        width: plate.width,
        // Fixed to the annotation rect's plate — the box never grows with
        // content; it scrolls while editing and clips otherwise, at the same
        // boundary the baked /AP clips at (`re W n` on the text body).
        height: plate.height,
        fontFamily: item.css.fontFamily,
        fontSize: item.css.fontSize * scale,
        // No line-height here: the binding states the engine's line model on
        // the element per face (ascent + descent + Acrobat's leading).
        color: item.css.color,
        fontWeight: item.css.fontWeight,
        fontStyle: item.css.fontStyle,
        textDecoration: item.css.textDecoration,
        textAlign: item.css.align,
        boxSizing: 'border-box',
        // The box's fill and border are the vector scene's (below this
        // layer), so a translucent box is painted once.
        background: 'transparent',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        overflowY: item.editing ? 'auto' : 'hidden',
        overflowX: 'hidden',
        outline: item.editing ? '1px solid #3858e9' : 'none',
        cursor: item.editing ? 'text' : 'default',
        // A plain text box rotates about its centre (the box model — same as the
        // baked /AP). `box` is the unrotated box; CSS rotate matches our CW `rot`.
        ...(item.rot ? { transform: `rotate(${item.rot}deg)`, transformOrigin: 'center' } : {}),
        // not editing → clicks fall through to the shape layer (select / move / resize)
        pointerEvents: item.editing ? 'auto' : 'none',
      }}
    />
  );
}

/**
 * Auto-registered behaviors for `interactive` renderer entries — refcounted
 * per (capability, entry) because the layer mounts once per page: the first
 * page registers, the last unregisters. Entry identity is the key, hence the
 * "define entries outside render" rule on {@link AnnotationRenderer}.
 */
const autoBehaviors = new WeakMap<
  object,
  Map<object, { id: string; count: number; unregister: () => void }>
>();
let autoBehaviorSeq = 0;

function useAutoBehaviors(
  anno: { registerBehavior(behavior: Behavior): () => void },
  renderers?: AnnotationRenderer[],
): void {
  useEffect(() => {
    if (!renderers) return;
    const released: Array<() => void> = [];
    for (const renderer of renderers) {
      if (!('for' in renderer) || !renderer.interactive) continue;
      let perCap = autoBehaviors.get(anno);
      if (!perCap) autoBehaviors.set(anno, (perCap = new Map()));
      let rec = perCap.get(renderer);
      if (!rec) {
        const id = renderer.id ?? `renderer:${++autoBehaviorSeq}`;
        const engaged =
          typeof renderer.interactive === 'function' ? renderer.interactive : () => true;
        rec = {
          id,
          count: 0,
          unregister: anno.registerBehavior({ id, matches: renderer.for, engaged }),
        };
        perCap.set(renderer, rec);
      }
      rec.count++;
      const owned = rec;
      released.push(() => {
        owned.count--;
        if (owned.count === 0) {
          owned.unregister();
          autoBehaviors.get(anno)?.delete(renderer);
        }
      });
    }
    return () => released.forEach((release) => release());
  }, [anno, renderers]);
}

/** The behavior id a renderer entry answers for (plugin-owned or auto-registered). */
function rendererBehaviorId(anno: object, renderer: AnnotationRenderer): string | null {
  if ('behavior' in renderer) return renderer.behavior;
  return autoBehaviors.get(anno)?.get(renderer)?.id ?? null;
}

/** React 18 spells the `inert` attribute as a string spread; it hard-disables
 *  pointer and focus for the whole subtree — the mechanical guarantee that a
 *  non-interactive renderer entry (a skin) can never steal input. */
const INERT = { inert: '' } as Record<string, string>;

export function AnnotationLayer({ renderers }: AnnotationLayerProps = {}) {
  const page = usePage();
  const anno = useCapability(AnnotationHostToken);
  // The page's view env (relative zoom + total display rotation) projects
  // screen-anchored (`noZoom`/`noRotate`) annotations to their effective
  // footprint inside the plugin — no flag logic lives in the framework.
  // `transform.zoom` (not `viewScale`): 1 = the page's physical 100%.
  const viewZoom = page.transform.zoom;
  const viewRotation = page.transform.rotation;
  const items = useSelector(
    AnnotationHostToken,
    (annotation) => annotation.listPageItems(page.ref, { zoom: viewZoom, rotation: viewRotation }),
    shallowArray,
  );
  const texts = useSelector(
    AnnotationHostToken,
    (annotation) => annotation.listTextItems(page.ref, { zoom: viewZoom, rotation: viewRotation }),
    shallowArray,
  );
  const [urls, setUrls] = useState<Record<string, { url: string; box: Rect }>>({});
  useAutoBehaviors(anno, renderers);
  usePageLayerFact(page, 'annotationRenderers', renderers ?? null);
  // Entry identity keys the behavior registration, so an inline `renderers`
  // array re-registers every render. Detect it once: a fresh array whose
  // entries are the previous ones.
  const previousRenderers = useRef(renderers);
  if (
    renderers &&
    previousRenderers.current &&
    renderers !== previousRenderers.current &&
    shallowArray(renderers, previousRenderers.current)
  ) {
    devWarn(
      'annotation-renderers-inline',
      '<AnnotationLayer renderers> was given a new array with the same entries — define it ' +
        'outside render (module scope or useMemo), because entry identity keys the behavior registration.',
    );
  }
  previousRenderers.current = renderers;

  // Baked annotations render from engine rasters — refetch when the page's
  // baked set or an /AP content version changes (a freshly placed stamp, a
  // resize whose re-bake resolved), plus at appearance-scale crossings. A move
  // or a rotate leaves the epoch untouched (the blit repositions the same
  // pixels), and live gesture previews don't touch it either — so no mid-drag
  // spam.
  const bakedKey = useSelector(AnnotationHostToken, (annotation) =>
    annotation.getAppearanceEpoch(page.ref),
  );
  // The bake scale conforms to the document's render policy — the plugin's
  // own capability over the kernel-materialized fact (no foreign tokens):
  // zoom ticks inside an appearance-lattice rung re-bake nothing; crossing
  // 1→2 re-bakes once; continuous is the identity.
  const bakeScale = useSelector(AnnotationHostToken, (annotation) =>
    annotation.getBakeScale(page.transform.renderScale),
  );

  useEffect(() => {
    const controller = new AbortController();
    const revokers: Array<() => void> = [];
    (async () => {
      try {
        const imgs = await anno.renderAppearances(page.ref, bakeScale, controller.signal);
        const map: Record<string, { url: string; box: Rect }> = {};
        for (const ap of imgs) {
          // Place the baked bitmap by its own /Rect (the box it was rendered into),
          // converted to content space by the plugin — never a recomputed bound.
          const box = anno.pdfToPageRect(page.ref, ap.rect);
          if (!box) continue;
          const obj = await ap.image.objectUrl(controller.signal);
          if (controller.signal.aborted) {
            obj.revoke();
            return;
          }
          revokers.push(obj.revoke);
          map[annotationKey(ap.ref)] = { url: obj.url, box };
        }
        if (!controller.signal.aborted) setUrls(map);
      } catch {
        /* aborted / no appearances */
      }
    })();
    return () => {
      controller.abort();
      revokers.forEach((revoke) => revoke());
    };
  }, [anno, page.ref, bakeScale, bakedKey]);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {items.map((item) => {
        // The default visual: the engine's baked raster (blitted into the live
        // AP box — `apBox` follows a move) or the vector scene.
        const baked = urls[item.id];
        const native: React.ReactNode =
          item.source === 'baked' ? (
            baked ? (
              <BakedImage
                box={item.apBox ?? baked.box}
                url={baked.url}
                page={page}
                blend={item.blend}
                rot={item.apRot}
              />
            ) : null
          ) : (
            <Shape item={item} page={page} /> // shapes, cloudy, markup — all painted via scene()
          );

        // Ownership beats skin: an engaged behavior's renderer is authoritative
        // (form fill controls own their DOM); `for` rules apply only to
        // plane-owned annotations and render pointer-locked — a skin can change
        // pixels, never steal input.
        const behavior = anno.getBehaviorFor({ subtype: item.subtype, ref: item.ref });
        let out: React.ReactNode;
        if (behavior) {
          const entry = renderers?.find(
            (renderer) => rendererBehaviorId(anno, renderer) === behavior.id,
          );
          if (entry) {
            const Owner = entry.component;
            out = (
              <Owner
                item={item}
                page={page}
                appearance={baked ?? null}
                native={native}
                interactive
              />
            );
          } else {
            out = null; // engaged but no renderer wired — the owner shows nothing
          }
        } else {
          const entry = renderers?.find(
            (renderer) =>
              'for' in renderer && renderer.for({ subtype: item.subtype, ref: item.ref }),
          );
          if (entry) {
            const Skin = entry.component;
            out = (
              <div {...INERT} style={{ pointerEvents: 'none' }}>
                <Skin
                  item={item}
                  page={page}
                  appearance={baked ?? null}
                  native={native}
                  interactive={false}
                />
              </div>
            );
          } else {
            out = native;
          }
        }
        return <React.Fragment key={item.id}>{out}</React.Fragment>;
      })}
      {texts.map((text) => (
        <FreeText key={text.id} item={text} page={page} />
      ))}
      <ToolGhostImage page={page} />
      <Chrome page={page} />
    </div>
  );
}

/**
 * The default file-picker provider: the built-in file dialog (from
 * `@embedpdf/web`), honouring the tool's `accept` filter. This is the adapter
 * fulfilling the plugin's DOM-free port — the dialog lives here, in the
 * framework layer, never in the plugin. A picked `File` carries its own name
 * and mime, so it goes straight through as the engine's file source.
 */
export const filePickerProvider: FilePickerProvider = async (request) => {
  const file = await pickFile({ accept: request.accept ?? '*/*' });
  return file ? { data: file } : null;
};

/**
 * Install the file-picker provider for the active document — the one port
 * behind every click-then-pick tool (a stamp `'prompt'` source, the file-
 * attachment tool). Call once at a document-scoped spot (not inside
 * `<AnnotationLayer>`, which is per page). Defaults to
 * {@link filePickerProvider}, so a bare `useFilePickerProvider()` makes all of
 * them work out of the box; pass a custom provider (asset library, cloud
 * drive — switch on `req.subtype` / `req.toolId`) or `null` to make
 * click-then-pick tools inert. Cleared on unmount.
 */
export function useFilePickerProvider(
  provider: FilePickerProvider | null = filePickerProvider,
): void {
  const anno = useOptionalCapability(AnnotationToken);
  useEffect(() => {
    if (!anno) return;
    // One port per document: a second caller silently replaces the first.
    const installed = (filePickerInstalls.get(anno) ?? 0) + 1;
    filePickerInstalls.set(anno, installed);
    if (installed > 1) {
      devWarn(
        'file-picker-provider-twice',
        'useFilePickerProvider() is called from two mounted components for the same document — ' +
          'the later one wins. Call it once, at a document-scoped spot.',
      );
    }
    const remove = anno.setFilePickerProvider(provider);
    return () => {
      filePickerInstalls.set(anno, (filePickerInstalls.get(anno) ?? 1) - 1);
      remove();
    };
  }, [anno, provider]);
}
const filePickerInstalls = new WeakMap<object, number>();

export function useAnnotation() {
  return useCapability(AnnotationToken);
}

/** Subscribe to one annotation event for the mounted lifetime: `useAnnotationEvent((annotation) => annotation.onCreated, handler)`. */
export function useAnnotationEvent<T>(
  select: (annotation: AnnotationCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(AnnotationToken, select, handler);
}

/** Page-space annotation records matching `filter` (a page, a subtype, an
 *  author, a group), reference-stable while the matching set is unchanged. */
export function useAnnotationList(filter?: AnnotationFilter): readonly Annotation[] {
  const key = filter
    ? `${filter.page?.pageObjectNumber ?? ''}|${filter.subtype ?? ''}|${filter.author ?? ''}|${
        filter.group ? annotationKey(filter.group) : ''
      }`
    : '';
  // Keyed by value so an inline filter object never resubscribes.
  const stable = React.useMemo(() => filter, [key]);
  return useSelector(AnnotationToken, (annotation) => annotation.list(stable), shallowArray);
}

/** The selected annotation refs (group-expanded), reference-stable while unchanged. */
export function useAnnotationSelection() {
  return useSelector(AnnotationToken, (annotation) => annotation.getSelection(), sameRefs);
}
const sameRefs = (left: readonly AnnotationRef[], right: readonly AnnotationRef[]): boolean =>
  left === right ||
  (left.length === right.length &&
    left.every((ref, i) => annotationKey(ref) === annotationKey(right[i]!)));

/** Structural equality for a resolved props bag — keeps the subscription from
 *  re-rendering on unrelated dispatches, since `currentDefaults` returns a fresh
 *  object each call. Small flat objects; JSON compare is exact and cheap here. */
const sameProps = (left: AnnotationProps, right: AnnotationProps): boolean =>
  left === right || JSON.stringify(left) === JSON.stringify(right);

/**
 * A tool's resolved defaults (base + per-tool override) as a full flat props
 * bag, subscribed so a `setDefaults` re-renders the consumer. Use this — not the
 * imperative `useAnnotation().getToolDefaults(id)` — to drive default-editing
 * controls, so they reflect changes live. Pair with `propsForTool(id)` for the
 * specs to render.
 */
export function useAnnotationDefaults(toolId: string): AnnotationProps {
  return useSelector(
    AnnotationToken,
    (annotation) => annotation.getToolDefaults(toolId),
    sameProps,
  );
}

/**
 * The selection's editable properties — ordered specs shared by every selected
 * kind, current values, and which keys are mixed. The hook a property sidebar
 * renders from; write back with `useAnnotation().updateSelection({ [key]: v })`.
 * Reference-stable between model changes (the capability memoizes by model
 * identity), so the default equality is enough.
 */
export function useSelectionProps(): SelectionProps {
  return useSelector(AnnotationToken, (annotation) => annotation.getSelectionProps());
}

/**
 * The selection's `/F` annotation flags — per-flag `true`/`false`, `null` where
 * the selected annotations disagree (render an indeterminate control), `null`
 * overall when nothing is selected. Write back with
 * `useAnnotation().updateSelectionFlags({ locked: true })`. Reference-stable
 * between model changes, like {@link useSelectionProps}.
 */
export function useSelectionFlags(): SelectionFlags | null {
  return useSelector(AnnotationToken, (annotation) => annotation.getSelectionFlags());
}

// ── Comments (the conversation plane) ────────────────────────────────────────

/**
 * A {@link CommentThread} enriched with its page's live display position —
 * the framework-layer join. Identity stays `page` (like every
 * annotation surface); these two fields are presentation, tracking page
 * moves and deletes.
 */
export interface CommentThreadView extends CommentThread {
  /** Current 0-based display index of the thread's page; `-1` when the page
   *  is no longer in the document (one-frame teardown race on delete). */
  pageIndex: number;
  /** The page's `/PageLabels` label when the PDF declares one ("iv", "A-2"),
   *  else the 1-based position as a string — print it verbatim. */
  pageLabel: string;
  /**
   * The root annotation's rect in content space (y-down, crop-relative,
   * unscaled points) — the space `StageCapability.reveal` takes, so a
   * "jump to this comment" is `stage.reveal(pageIndex, { rect: contentRect })`.
   * Null when the page is gone. Identity still travels as `page`;
   * this, like `pageIndex`, is presentation.
   */
  contentRect: Rect | null;
}

/** Pure join behind {@link useCommentThreads} — exported for tests. */
export function enrichCommentThreads(
  threads: readonly CommentThread[],
  pages: readonly PageLayout[],
): CommentThreadView[] {
  const byPageObjectNumber = new Map(
    pages.map((pageInfo) => [pageInfo.ref.pageObjectNumber, pageInfo] as const),
  );
  return threads.map((thread) => {
    const page = byPageObjectNumber.get(thread.page.pageObjectNumber);
    return {
      ...thread,
      pageIndex: page ? page.index : -1,
      pageLabel: page ? (page.label ?? String(page.index + 1)) : '?',
      contentRect: page ? pdfToContentRect(thread.root.rect, page.boxes.crop) : null,
    };
  });
}

/** The comments surface (verbs + `permissionsFor`) — imperative; pair with
 *  {@link useCommentThreads} for the subscribed view. */
export function useComments(): CommentsApi {
  return useCapability(AnnotationToken).comments;
}

const EMPTY_PAGES: readonly PageLayout[] = [];

/**
 * Every comment thread in the document, display-ordered (page position →
 * top of page → creation date) and enriched with `pageIndex`/`pageLabel`.
 * Subscribed to both stores: annotation writes (own, remote, hydration)
 * recompute the threads; page moves/deletes re-run the join. Reference-
 * stable between changes — safe to memo child renders on the array.
 */
export function useCommentThreads(): CommentThreadView[] {
  const docId = useDocumentId();
  const threads = useSelector(AnnotationToken, (annotation) => annotation.comments.listThreads());
  const pages = useKernelValue((kernel) =>
    docId ? kernel.documents.listPages(docId) : EMPTY_PAGES,
  );
  return React.useMemo(() => enrichCommentThreads(threads, pages), [threads, pages]);
}

/** The enriched thread containing any member ref (root, reply, grouped part,
 *  state annotation), or null. */
export function useCommentThread(ref: AnnotationRef | null): CommentThreadView | null {
  const views = useCommentThreads();
  const api = useComments();
  if (ref == null) return null;
  const thread = api.getThread(ref);
  if (!thread) return null;
  return (
    views.find((view) => annotationKey(view.root.ref) === annotationKey(thread.root.ref)) ?? null
  );
}

/** Whole-document hydration status — the comments sidebar's honest loading
 *  state (`loading` until every annotation is in, then `ready`, `forbidden` or `error`). */
export function useAnnotationStatus(): ResourceStatus {
  return useSelector(AnnotationToken, (annotation) => annotation.getStatus());
}
