/**
 * The React view of @embedpdf/plugin-annotation.
 *
 * Pure paint: it reads the per-page render items + chrome and draws them. Pointer
 * events arrive through the interaction hub (the Stage's forwarding), and the
 * CURSOR is driven by the hub too (the edit handler claims move/pointer/resize on
 * hover). Each annotation resolves to ONE native node — a vector SceneSvg, the
 * engine's baked /AP <img>, or a registered behavior — and the host
 * `customRenderer` may wrap or replace it.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-annotation';
import * as React from 'react';
import { useEffect, useState } from 'react';
import {
  AnnotationToken,
  refKey,
  type AnnotationHydration,
  type AnnotationRef,
  type Behavior,
  type CommentsApi,
  type CommentThread,
  type SelectionFlags,
  type SelectionProps,
  type FilePickerProvider,
  type TextItem,
} from '@embedpdf/plugin-annotation';
import { pickFile } from '@embedpdf/web';
// The render layer is framework code, so it resolves the FULL host lens
// (pageItems/chrome/appearances/…). Same runtime token as the public one — only
// the type differs. App code never imports this.
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/internal';
import {
  scene,
  MITER_LIMIT,
  pdfToContentRect,
  type AnnotationProps,
  type CreationDraftAnchor,
  type Paint,
  type Rect,
  type RenderItem,
  type Vec,
} from '@embedpdf/core-annotation';

export type {
  CreationDraftAnchor,
  RenderItem,
  Geom,
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
import {
  shallowArray,
  useCapability,
  useDocumentId,
  useKernelValue,
  useOptionalCapability,
  usePage,
  useSelector,
} from './runtime';
import type { PageContextValue, PageLayout } from './runtime';

/** `#rrggbb` → `rgba(...)` — the marquee's translucent fill derives from the
 *  accent, so one `setChrome({ accent })` restyles every piece of chrome. */
const rgba = (hex: string, alpha: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

/**
 * What an annotation renderer receives: the projected item (its `box` is LIVE —
 * it follows drags), the page context, the engine's baked /AP raster (the
 * "picture"), the default visual (`native` — wrap it or ignore it), and
 * whether this entry currently OWNS the pointer (`interactive`). While not
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
 * ONE rule: "for THESE annotations, render THIS component, and it owns the
 * pointer WHEN …". The two shapes:
 *
 *   - `{ for, component, interactive? }` — your own rule. Without
 *     `interactive` it is a pure SKIN: pixels only, mechanically
 *     pointer-locked, the annotation plane keeps selection/move/resize. With
 *     `interactive` (boolean or live predicate) the layer registers a plugin
 *     Behavior for you: while it holds, the annotation plane stands down
 *     (hit-test-inert) and your component owns the input.
 *   - `{ behavior, component }` — the renderer for a PLUGIN-registered
 *     behavior (the form plugin's fill controls via `formWidgetRenderer`);
 *     the plugin decides engagement, never the app.
 *
 * Resolution: ownership beats skin — an ENGAGED behavior's component is
 * authoritative; `for` rules apply only to plane-owned annotations, first
 * match wins. Define entries OUTSIDE render (module scope or useMemo): entry
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
function boxOf(r: Rect, page: PageContextValue) {
  const tl = page.transform.toPixels({ x: r.x, y: r.y });
  const br = page.transform.toPixels({ x: r.x + r.width, y: r.y + r.height });
  return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y };
}

/** Map a core `Paint` to SVG presentation attributes — the whole framework-facing
 *  surface. Everything else about appearance is decided in the core's `scene`. */
function paintAttrs(p: Paint) {
  return {
    fill: p.fill ?? 'none',
    stroke: p.stroke ?? 'none',
    strokeWidth: p.width,
    opacity: p.opacity,
    strokeLinejoin: p.join ?? ('miter' as const), // undefined → sharp miter; 'round' only for ink
    strokeMiterlimit: MITER_LIMIT, // must match the bounds math so spike vs bevel agree
    strokeLinecap: p.cap, // undefined → SVG default (butt); 'round' only for ink
    strokeDasharray: p.dash ? p.dash.join(' ') : undefined,
    ...(p.blend ? { style: { mixBlendMode: p.blend } } : {}),
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
  // The viewBox (content units) and the <svg> on-screen size MUST stay proportional
  // (scale == zoom). Clamping either — e.g. a `max(1px)` floor on the element while
  // the viewBox keeps shrinking — decouples them, so a sub-pixel box scales content
  // up by ~1/size and a cloudy border's scallops flood the stage. No clamps here.
  const vb = `${item.box.x} ${item.box.y} ${item.box.width} ${item.box.height}`;
  // BOX-family kinds (square/circle, caret) carry an UNROTATED `box` + a `rot`
  // angle; rotate the whole <svg> about its centre. VERTEX kinds (line/poly/ink)
  // are already rotated in their geometry, so `rot` is advisory there — never
  // re-applied.
  const rot = item.geom.t === 'rect' || item.geom.t === 'caret' ? (item.rot ?? 0) : 0;
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
  return scene(item).map((n, i) => {
    const a = paintAttrs(n.paint);
    if (n.kind === 'rect')
      return (
        <rect
          key={i}
          x={n.rect.x}
          y={n.rect.y}
          width={n.rect.width}
          height={n.rect.height}
          {...a}
        />
      );
    if (n.kind === 'ellipse')
      return (
        <ellipse
          key={i}
          cx={n.rect.x + n.rect.width / 2}
          cy={n.rect.y + n.rect.height / 2}
          rx={n.rect.width / 2}
          ry={n.rect.height / 2}
          {...a}
        />
      );
    if (n.kind === 'line')
      return <line key={i} x1={n.a.x} y1={n.a.y} x2={n.b.x} y2={n.b.y} {...a} />;
    if (n.kind === 'path') return <path key={i} d={n.d} {...a} />;
    if (n.kind === 'text')
      return (
        <text
          key={i}
          x={n.at.x}
          y={n.at.y}
          fontSize={n.fontSize}
          {...(n.fontFamily ? { fontFamily: n.fontFamily } : {})}
          {...a}
        >
          {n.text}
        </text>
      );
    const pts = n.points.map((p) => `${p.x},${p.y}`).join(' ');
    return n.closed ? (
      <polygon key={i} points={pts} {...a} />
    ) : (
      <polyline key={i} points={pts} {...a} />
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
  /** The rotation (deg, CW) the engine STRIPPED from this raster
   *  (`RenderItem.apRot`) — re-applied here as a view transform, so a live
   *  rotate gesture spins the bitmap with zero engine re-renders. Unset for
   *  rasters that already contain their rotation (vertex kinds). */
  rot?: number;
}) {
  const b = boxOf(box, page);
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        // The AP box is sized in content units; a global `img { max-width: 100% }`
        // reset would otherwise clamp it to the containing block and distort the
        // aspect. This bites specifically when the box is WIDER than that block —
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
 * The armed stamp's IMAGE footprint ghost: a translucent render of the payload
 * drawn in the EXACT box a click would place it (the plugin computes it with
 * the same fit + clamp as placement). Vector footprint ghosts never reach this
 * component — they ride `pageItems` like every draft preview. The preview
 * bytes live in the capability closure; this layer owns only the object-URL
 * lifetime, keyed on the arm epoch — a new arm swaps the image, a disarm (or
 * tool change) drops it.
 */
function ToolGhostImage({ page }: { page: PageContextValue }) {
  const anno = useCapability(AnnotationHostToken);
  const ghost = useSelector(AnnotationHostToken, (c) => c.toolGhost(page.pon));
  const epoch = useSelector(AnnotationHostToken, (c) => c.stampArmEpoch());
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const preview = anno.armedStampPreview();
    if (!preview) {
      setUrl(null);
      return;
    }
    // Copy into an EXACT ArrayBuffer (the engine idiom): a Uint8Array view may
    // sit on a larger or shared buffer, which Blob won't accept.
    const body = new ArrayBuffer(preview.bytes.byteLength);
    new Uint8Array(body).set(preview.bytes);
    const blob = new Blob([body], preview.mimeType ? { type: preview.mimeType } : {});
    const obj = URL.createObjectURL(blob);
    setUrl(obj);
    return () => {
      URL.revokeObjectURL(obj);
      setUrl(null);
    };
  }, [anno, epoch]);

  if (!ghost || ghost.kind !== 'image' || !url) return null;
  const b = boxOf(ghost.box, page);
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
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
    (c) => c.chrome(page.pon, scale, rotation, zoom),
    shallowArray,
  );
  const cs = useSelector(AnnotationHostToken, (c) => c.chromeSettings());
  // The accent cascade: each piece's color falls back to the one accent.
  const outlineStroke = cs.outline.color ?? cs.accent;
  const handleStroke = cs.handles.stroke ?? cs.accent;
  const knobStroke = cs.knob.stroke ?? cs.accent;
  // ONE outline style for the resting rect AND the rotated obb — the selection
  // box must never flip dashed↔solid when a rotation starts.
  const outlineDash = cs.outline.style === 'dashed' ? '4 3' : undefined;
  // The live rotation readout — an HTML chip (rounded box + padded text beats
  // hand-rolling it in SVG), riding the pointer like v2's.
  const chip = nodes.find((n) => n.kind === 'angle-chip');
  const chipAt = chip ? page.transform.toPixels(chip.at) : null;
  return (
    <>
      <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {nodes.map((n, i) => {
          if (n.kind === 'angle-chip') return null; // rendered as HTML below
          if (n.kind === 'handle') {
            const p = page.transform.toPixels(n.at);
            const hs = cs.handles.size;
            return (
              <rect
                key={i}
                x={p.x - hs / 2}
                y={p.y - hs / 2}
                width={hs}
                height={hs}
                fill={cs.handles.fill}
                stroke={handleStroke}
                strokeWidth={1.5}
                // The square rides a rotated box's orientation (spin about itself).
                {...(n.rot ? { transform: `rotate(${n.rot} ${p.x} ${p.y})` } : {})}
              />
            );
          }
          // A live alignment guide of a snapped move: a through-line at the snapped
          // edge/center, spanning both shapes.
          if (n.kind === 'guide') {
            const a = page.transform.toPixels(
              n.axis === 'x' ? { x: n.at, y: n.lo } : { x: n.lo, y: n.at },
            );
            const b = page.transform.toPixels(
              n.axis === 'x' ? { x: n.at, y: n.hi } : { x: n.hi, y: n.at },
            );
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#e91e63"
                strokeWidth={1.5}
                shapeRendering="crispEdges"
              />
            );
          }
          // An oriented selection box (a tilted shape/group): a closed quad through
          // the four content-space corners — replaces the axis-aligned outline.
          if (n.kind === 'obb') {
            const pts = n.corners
              .map((c) => {
                const p = page.transform.toPixels(c);
                return `${p.x},${p.y}`;
              })
              .join(' ');
            return (
              <polygon
                key={i}
                points={pts}
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
          if (n.kind === 'rotate-guides') {
            const guideDash = cs.guides.style === 'dashed' ? '4 3' : undefined;
            return (
              <g key={i}>
                {n.lines.map((l, j) => {
                  const a = page.transform.toPixels(l.a);
                  const b = page.transform.toPixels(l.b);
                  const axis = l.role === 'axis';
                  return (
                    <line
                      key={j}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
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
          if (n.kind === 'rotate-knob') {
            const at = page.transform.toPixels(n.at);
            const from = page.transform.toPixels(n.from);
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
          const b = boxOf(n.rect, page);
          // The marquee rubber band keeps its own look (translucent accent fill,
          // always dashed); the selection outline follows the settings.
          if (n.kind === 'marquee') {
            return (
              <rect
                key={i}
                x={b.left}
                y={b.top}
                width={b.width}
                height={b.height}
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
              x={b.left}
              y={b.top}
              width={b.width}
              height={b.height}
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
 * A free-text annotation: the SAME styled element for viewing and editing —
 * `contentEditable` just toggles, so the text never jumps. The plugin handed us a
 * ready-to-spread style (`item.css`); the browser owns layout, caret, selection,
 * IME and clipboard; the plugin owns the text truth + the debounced engine write.
 * This component is the ENTIRE per-framework surface for text editing.
 */
function FreeText({ item, page }: { item: TextItem; page: PageContextValue }) {
  const anno = useCapability(AnnotationHostToken);
  const ref = React.useRef<HTMLDivElement>(null);
  const box = boxOf(item.box, page);
  const scale = item.box.width > 0 ? box.width / item.box.width : 1; // content units → screen px

  // DOM ← model, but ONLY when this element isn't being typed in — keeps the caret
  // stable while you type AND lets a remote (collab) edit land live when idle.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerText !== item.contents) {
      el.innerText = item.contents;
    }
  }, [item.contents, item.editing]);
  // Keep DOM focus in sync with the model's `editing` state. Focus follows the
  // model — it never drives it (exit is hub-driven, see the edit handler), so a
  // transient focus-steal by the page surface can't end the edit.
  useEffect(() => {
    if (item.editing) ref.current?.focus();
  }, [item.editing]);

  // Isolate the editor from the interaction hub: a pointerdown inside it must NOT
  // bubble up to the Stage's native listener (which the edit handler reads as a
  // click-outside → exit). Stopping it here lets the browser own caret placement
  // and drag-selection inside the box, while clicks OUTSIDE still reach the hub and
  // commit the edit. Native listener (not React's) so it runs during real DOM
  // bubbling, before the Stage's own native listener on an ancestor.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    return () => el.removeEventListener('pointerdown', stop);
  }, []);

  return (
    <div
      ref={ref}
      contentEditable={item.editing}
      suppressContentEditableWarning
      onInput={() => item.ref && anno.setContents(item.ref, ref.current!.innerText)}
      onBlur={(e) => {
        // The gesture that opens the editor fires a native `mousedown` on the
        // non-focusable page surface, which blurs us to <body> (relatedTarget null)
        // right after we focus. If the MODEL still has this box in edit, that blur
        // is a spurious steal — re-assert focus. A real click-away routes through
        // the hub, which clears `editing` BEFORE this fires, so we let it go (and a
        // focus move to a real element, relatedTarget != null, is always honoured).
        if (
          e.relatedTarget == null &&
          ref.current?.isConnected &&
          anno.currentEditing() === item.id
        ) {
          ref.current.focus();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        // Fixed to the annotation rect — the box never grows with content; it
        // scrolls while editing and clips otherwise (matching the baked /AP).
        height: box.height,
        fontFamily: item.css.fontFamily,
        fontSize: item.css.fontSize * scale,
        lineHeight: `${item.css.lineHeight * scale}px`,
        color: item.css.color,
        textAlign: item.css.align,
        padding: item.css.padding * scale,
        boxSizing: 'border-box',
        background: item.css.background ?? 'transparent',
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
 * per (capability, entry) because the layer mounts once PER PAGE: the first
 * page registers, the last unregisters. Entry identity is the key, hence the
 * "define entries outside render" rule on {@link AnnotationRenderer}.
 */
const autoBehaviors = new WeakMap<
  object,
  Map<object, { id: string; count: number; unregister: () => void }>
>();
let autoBehaviorSeq = 0;

function useAutoBehaviors(
  anno: { registerBehavior(b: Behavior): () => void },
  renderers?: AnnotationRenderer[],
): void {
  useEffect(() => {
    if (!renderers) return;
    const released: Array<() => void> = [];
    for (const r of renderers) {
      if (!('for' in r) || !r.interactive) continue;
      let perCap = autoBehaviors.get(anno);
      if (!perCap) autoBehaviors.set(anno, (perCap = new Map()));
      let rec = perCap.get(r);
      if (!rec) {
        const id = r.id ?? `renderer:${++autoBehaviorSeq}`;
        const engaged = typeof r.interactive === 'function' ? r.interactive : () => true;
        rec = { id, count: 0, unregister: anno.registerBehavior({ id, matches: r.for, engaged }) };
        perCap.set(r, rec);
      }
      rec.count++;
      const owned = rec;
      released.push(() => {
        owned.count--;
        if (owned.count === 0) {
          owned.unregister();
          autoBehaviors.get(anno)?.delete(r);
        }
      });
    }
    return () => released.forEach((f) => f());
  }, [anno, renderers]);
}

/** The behavior id a renderer entry answers for (plugin-owned or auto-registered). */
function rendererBehaviorId(anno: object, r: AnnotationRenderer): string | null {
  if ('behavior' in r) return r.behavior;
  return autoBehaviors.get(anno)?.get(r)?.id ?? null;
}

/** React 18 spells the `inert` attribute as a string spread; it hard-disables
 *  pointer AND focus for the whole subtree — the mechanical guarantee that a
 *  non-interactive renderer entry (a skin) can never steal input. */
const INERT = { inert: '' } as Record<string, string>;

export function AnnotationLayer({ renderers }: AnnotationLayerProps = {}) {
  const page = usePage();
  const anno = useCapability(AnnotationHostToken);
  // The page's view env (RELATIVE zoom + total display rotation) projects
  // screen-anchored (`noZoom`/`noRotate`) annotations to their effective
  // footprint INSIDE the plugin — no flag logic lives in the framework.
  // `transform.zoom` (not `viewScale`): 1 = the page's physical 100%.
  const viewZoom = page.transform.zoom;
  const viewRotation = page.transform.rotation;
  const items = useSelector(
    AnnotationHostToken,
    (c) => c.pageItems(page.pon, { zoom: viewZoom, rotation: viewRotation }),
    shallowArray,
  );
  const texts = useSelector(
    AnnotationHostToken,
    (c) => c.textItems(page.pon, { zoom: viewZoom, rotation: viewRotation }),
    shallowArray,
  );
  const [urls, setUrls] = useState<Record<string, { url: string; box: Rect }>>({});
  useAutoBehaviors(anno, renderers);

  useEffect(() => {
    anno.ensurePage(page.pon);
  }, [anno, page.pon]);

  // Baked annotations render from engine rasters — refetch when the page's
  // baked set or an /AP content version changes (a freshly placed stamp, a
  // resize whose re-bake RESOLVED), plus at APPEARANCE-SCALE crossings. A move
  // or a rotate leaves the epoch untouched (the blit repositions the same
  // pixels), and live gesture previews don't touch it either — so no mid-drag
  // spam.
  const bakedKey = useSelector(AnnotationHostToken, (c) => c.appearanceEpoch(page.pon));
  // The bake scale conforms to the document's render policy — the plugin's
  // OWN capability over the kernel-materialized fact (no foreign tokens):
  // zoom ticks inside an appearance-lattice rung re-bake NOTHING; crossing
  // 1→2 re-bakes once; continuous is the identity.
  const bakeScale = useSelector(AnnotationHostToken, (c) =>
    c.bakeScale(page.transform.renderScale),
  );

  useEffect(() => {
    const controller = new AbortController();
    const revokers: Array<() => void> = [];
    (async () => {
      try {
        const imgs = await anno.appearances(page.pon, bakeScale, controller.signal);
        const map: Record<string, { url: string; box: Rect }> = {};
        for (const ap of imgs) {
          // Place the baked bitmap by its OWN /Rect (the box it was rendered into),
          // converted to content space by the plugin — never a recomputed bound.
          const box = anno.toContentBox(page.pon, ap.rect);
          if (!box) continue;
          const obj = await ap.image.objectUrl(controller.signal);
          if (controller.signal.aborted) {
            obj.revoke();
            return;
          }
          revokers.push(obj.revoke);
          map[refKey(ap.ref)] = { url: obj.url, box };
        }
        if (!controller.signal.aborted) setUrls(map);
      } catch {
        /* aborted / no appearances */
      }
    })();
    return () => {
      controller.abort();
      revokers.forEach((r) => r());
    };
  }, [anno, page.pon, bakeScale, bakedKey]);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {items.map((item) => {
        // The default visual: the engine's baked raster (blitted into the LIVE
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

        // Ownership beats skin: an ENGAGED behavior's renderer is authoritative
        // (form fill controls own their DOM); `for` rules apply only to
        // plane-owned annotations and render pointer-locked — a skin can change
        // pixels, never steal input.
        const behavior = anno.behaviorFor({ subtype: item.subtype, ref: item.ref });
        let out: React.ReactNode;
        if (behavior) {
          const entry = renderers?.find((r) => rendererBehaviorId(anno, r) === behavior.id);
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
            (r) => 'for' in r && r.for({ subtype: item.subtype, ref: item.ref }),
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
      {texts.map((t) => (
        <FreeText key={t.id} item={t} page={page} />
      ))}
      <ToolGhostImage page={page} />
      <Chrome page={page} />
    </div>
  );
}

/**
 * The default file-picker provider: the built-in file dialog (from
 * `@embedpdf/web`), honouring the tool's `accept` filter. This is the ADAPTER
 * fulfilling the plugin's DOM-free port — the dialog lives here, in the
 * framework layer, never in the plugin. A picked `File` carries its own name
 * and mime, so it goes straight through as the engine's file source.
 */
export const filePickerProvider: FilePickerProvider = async (req) => {
  const file = await pickFile({ accept: req.accept ?? '*/*' });
  return file ? { data: file } : null;
};

/**
 * Install the file-picker provider for the active document — the ONE port
 * behind every click-then-pick tool (a stamp `'prompt'` source, the file-
 * attachment tool). Call ONCE at a document-scoped spot (not inside
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
    anno.setFilePickerProvider(provider);
    return () => anno.setFilePickerProvider(null);
  }, [anno, provider]);
}

export function useAnnotation() {
  return useCapability(AnnotationToken);
}

export function useAnnotationSelection() {
  return useSelector(AnnotationToken, (c) => c.selection(), shallowArray);
}

/** The selected annotations as engine DTOs — for selection-aware toolbars/sidebars. */
export function useAnnotationSelected() {
  return useSelector(AnnotationToken, (c) => c.getSelected(), shallowArray);
}

/** Structural equality for a resolved props bag — keeps the subscription from
 *  re-rendering on unrelated dispatches, since `currentDefaults` returns a fresh
 *  object each call. Small flat objects; JSON compare is exact and cheap here. */
const sameProps = (a: AnnotationProps, b: AnnotationProps): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * A tool's RESOLVED defaults (base + per-tool override) as a full flat props
 * bag, subscribed so a `setDefaults` re-renders the consumer. Use this — not the
 * imperative `useAnnotation().currentDefaults(id)` — to drive default-editing
 * controls, so they reflect changes live. Pair with `propsForTool(id)` for the
 * specs to render.
 */
export function useAnnotationDefaults(toolId: string): AnnotationProps {
  return useSelector(AnnotationToken, (c) => c.currentDefaults(toolId), sameProps);
}

/**
 * The selection's editable properties — ordered specs shared by every selected
 * kind, current values, and which keys are mixed. THE hook a property sidebar
 * renders from; write back with `useAnnotation().updateSelection({ [key]: v })`.
 * Reference-stable between model changes (the capability memoizes by model
 * identity), so the default equality is enough.
 */
export function useSelectionProps(): SelectionProps {
  return useSelector(AnnotationToken, (c) => c.getSelectionProps());
}

/**
 * The selection's `/F` annotation flags — per-flag `true`/`false`, `null` where
 * the selected annotations disagree (render an indeterminate control), `null`
 * overall when nothing is selected. Write back with
 * `useAnnotation().updateSelectionFlags({ locked: true })`. Reference-stable
 * between model changes, like {@link useSelectionProps}.
 */
export function useSelectionFlags(): SelectionFlags | null {
  return useSelector(AnnotationToken, (c) => c.getSelectionFlags());
}

// ── Comments (the conversation plane) ────────────────────────────────────────

/**
 * A {@link CommentThread} enriched with its page's live display position —
 * the framework-layer join. Identity stays `pageObjectNumber` (like every
 * annotation surface); these two fields are PRESENTATION, tracking page
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
   * The root annotation's rect in CONTENT space (y-down, crop-relative,
   * unscaled points) — the space `StageCapability.reveal` takes, so a
   * "jump to this comment" is `stage.reveal(pageIndex, { rect: contentRect })`.
   * Null when the page is gone. Identity still travels as `pageObjectNumber`;
   * this, like `pageIndex`, is presentation.
   */
  contentRect: Rect | null;
}

/** Pure join behind {@link useCommentThreads} — exported for tests. */
export function enrichCommentThreads(
  threads: readonly CommentThread[],
  pages: readonly PageLayout[],
): CommentThreadView[] {
  const byPon = new Map(pages.map((p) => [p.pageObjectNumber, p] as const));
  return threads.map((t) => {
    const page = byPon.get(t.pageObjectNumber);
    return {
      ...t,
      pageIndex: page ? page.index : -1,
      pageLabel: page ? (page.label ?? String(page.index + 1)) : '?',
      contentRect: page ? pdfToContentRect(t.root.rect, page.boxes.crop) : null,
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
 * Subscribed to BOTH stores: annotation writes (own, remote, hydration)
 * recompute the threads; page moves/deletes re-run the join. Reference-
 * stable between changes — safe to memo child renders on the array.
 */
export function useCommentThreads(): CommentThreadView[] {
  const docId = useDocumentId();
  const threads = useSelector(AnnotationToken, (c) => c.comments.threads());
  const pages = useKernelValue((k) =>
    docId ? (k.getState().core.documents[docId]?.pages ?? EMPTY_PAGES) : EMPTY_PAGES,
  );
  return React.useMemo(() => enrichCommentThreads(threads, pages), [threads, pages]);
}

/** The enriched thread containing ANY member ref (root, reply, grouped part,
 *  state annotation), or null. */
export function useCommentThread(ref: AnnotationRef | null): CommentThreadView | null {
  const views = useCommentThreads();
  const api = useComments();
  if (ref == null) return null;
  const t = api.thread(ref);
  if (!t) return null;
  return views.find((v) => refKey(v.root.ref) === refKey(t.root.ref)) ?? null;
}

/** Whole-document hydration status — the comments sidebar's honest loading
 *  state (`loading` until `listRawAll` lands, then `complete`/`error`). */
export function useCommentsHydration(): AnnotationHydration {
  return useSelector(AnnotationToken, (c) => c.comments.hydration());
}

// ── Selection-menu anchor vocabulary ─────────────────────────────────────────
// The content-space anchor (`selectionAnchor`) consumed by `<AnnotationMenu>`
// (./annotation-menu) through the surface-provided ViewProjector — one menu
// implementation for <Stage> and <PageView> alike (see ./anchored).

/** The selection's menu anchor: the primary page + the union box of the selection
 *  on that page (content space). */
export type SelectionAnchor = { pon: number; bounds: Rect; knob?: Vec };

/** Structural equality for the selection anchor — keeps the menu from re-rendering
 *  on unrelated dispatches (the capability returns a fresh object each call). */
export function sameAnchor(a: SelectionAnchor | null, b: SelectionAnchor | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.pon === b.pon &&
    a.bounds.x === b.bounds.x &&
    a.bounds.y === b.bounds.y &&
    a.bounds.width === b.bounds.width &&
    a.bounds.height === b.bounds.height &&
    a.knob?.x === b.knob?.x &&
    a.knob?.y === b.knob?.y
  );
}

export function sameCreationDraftAnchor(
  a: CreationDraftAnchor | null,
  b: CreationDraftAnchor | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.subtype === b.subtype &&
    a.pon === b.pon &&
    a.pointCount === b.pointCount &&
    a.minPoints === b.minPoints &&
    a.canFinish === b.canFinish &&
    a.bounds.x === b.bounds.x &&
    a.bounds.y === b.bounds.y &&
    a.bounds.width === b.bounds.width &&
    a.bounds.height === b.bounds.height
  );
}

