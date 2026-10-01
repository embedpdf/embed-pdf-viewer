/**
 * The React view of @embedpdf/plugin-annotation.
 *
 * Pure paint: it reads the per-page render items and chrome and draws them.
 * Pointer events arrive through the interaction hub (the Stage's forwarding),
 * and the cursor is driven by the hub too (the edit handler claims
 * move/pointer/resize on hover). Each annotation resolves to one native node:
 * a vector scene, the engine's baked /AP <img>, or a registered behavior; a
 * renderer may wrap or replace it. Every chrome color is a setting painted
 * through `paint()`, so its `--epdf-annotation-*` CSS variable wins.
 *
 * The hooks follow every plugin's four: `useAnnotation()` (the API),
 * `useAnnotationState()` (status, selected, hovered, editing),
 * `useAnnotationEvent()` and `useAnnotationSettings()`; the reads a component
 * follows on their own are `useAnnotationList()`, `useAnnotationDefaults()`,
 * `useAnnotationProperties()` and `useAnnotationAnchor()`.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-annotation';
import type { EventHook, PageRef } from '@embedpdf/core';
import {
  scene,
  MITER_LIMIT,
  type ChromeNode,
  type FieldValues,
  type Paint,
  type Point,
  type Rect,
  type RenderItem,
} from '@embedpdf/core-annotation';
import {
  AnnotationToken,
  annotationKey,
  type Annotation,
  type AnnotationAnchor,
  type AnnotationCapability,
  type AnnotationFilter,
  type AnnotationProperties,
  type AnnotationRef,
  type Behavior,
  type ChromeSettings,
  type CommentsApi,
  type CommentThread,
  type FilePickerProvider,
  type HandleRole,
  type TextItem,
  type ToolDefaults,
} from '@embedpdf/plugin-annotation';
// The render layer is framework code, so it resolves the full host lens
// (page items, chrome, appearances…). Same runtime token as the public one,
// only the type differs. App code never imports this.
import {
  AnnotationToken as AnnotationHostToken,
  previewBucket,
} from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import {
  attachRichTextEditor,
  frameInPixels,
  mixAccent,
  paint,
  pickFile,
  rasterInFrame,
  type FrameFraction,
  type RichTextEditorBinding,
  type RichTextEditorHost,
} from '@embedpdf/web';
import { useEffect, useRef, useState } from 'react';
import * as React from 'react';

export type {
  CreationDraftAnchor,
  RenderItem,
  LineEnding,
  LineEndings,
  Style,
  AnnotationFlags,
  FieldValues,
  TextAlign,
  TextStyle,
} from '@embedpdf/core-annotation';
import { devWarn } from './dev';
import { usePageLayerFact } from './dev-registry';
import { useAnnotationSettings } from './annotation-hooks';
import {
  shallowArray,
  useCapability,
  useCapabilityEvent,
  useDocumentId,
  useKernelValue,
  useOptionalCapability,
  useOptionalSelector,
  usePage,
  useSelector,
  useViewerSettings,
} from './runtime';
import type { PageContextValue, PageLayout } from './runtime';

export { sameAnchor, sameCreationDraftAnchor } from './annotation-anchors';
export { useAnnotationSettings, useAnnotationState } from './annotation-hooks';
export {
  AnnotationDraftMenu,
  AnnotationMenu,
  AnnotationRotationBadge,
  type AnnotationDraftMenuProps,
  type AnnotationMenuProps,
  type AnnotationRotationBadgeProps,
} from './annotation-menu';

// ── renderers ────────────────────────────────────────────────────────────────

/** The box a renderer draws into: the size to draw at, how it's turned, and how it's scaled. */
export interface AnnotationFrame {
  /** Its width in pixels at the annotation's 100% size, before its turn: draw at this. */
  width: number;
  /** Its height in pixels at the annotation's 100% size, before its turn: draw at this. */
  height: number;
  /**
   * How it's turned on screen, degrees clockwise: the page's turn and the
   * annotation's own. 0 is upright; turn your content by `-rotation` to keep
   * it upright.
   */
  rotation: number;
  /**
   * How much the layer scales what you draw, with the page: the zoom, or for
   * an annotation that keeps its size on screen, the zoom up to 1.
   */
  scale: number;
}

/**
 * What a renderer's component gets: the annotation, the frame to draw into,
 * and the layer's own drawing of it to keep or wrap. The layer keeps handling
 * the pointer (select, move, resize) unless the renderer is `interactive`.
 */
export interface AnnotationRendererProps {
  /** The annotation, as `get()` returns it. */
  annotation: Annotation;
  /**
   * The box you draw into. The layer places, turns and scales it like the
   * annotation's own drawing, also during a drag, a resize or a turn. Fill it
   * (`width: 100%; height: 100%`) and draw at the annotation's 100% size: your
   * text and borders scale with the page.
   */
  frame: AnnotationFrame;
  /** The layer's own drawing of it, filling the frame. Render it to keep the original look and add to it. */
  native: React.ReactNode;
  /** The engine's picture of the annotation as an image (`url`), or `null`. `native` draws it in place. */
  appearance: { url: string } | null;
  /** True while the pointer is over it. */
  hovered: boolean;
  /** True while it's selected. */
  selected: boolean;
  /** True when what you draw takes the pointer (see `interactive` on the renderer). */
  interactive: boolean;
}

/**
 * What a sibling plugin's renderer gets for the annotations its behavior owns
 * (the form plugin's fill controls). It places its own controls: `item` is the
 * layer's projection of the annotation (its box, style, text and raster box,
 * in page coordinates), and `page.transform.toPixels()` turns those into the
 * layer's pixels.
 */
export interface BehaviorRendererProps {
  annotation: Annotation;
  item: RenderItem;
  page: PageContextValue;
  /** The layer's own drawing of it, where the layer draws it. */
  native: React.ReactNode;
  hovered: boolean;
  selected: boolean;
  interactive: boolean;
}

/** What an `interactive` function is asked: the annotation, and the active tool. */
export interface AnnotationInteractiveContext {
  annotation: Annotation;
  toolId: string;
}

/**
 * One rule: "draw these annotations with this component". `for` gets the
 * annotation with all its fields; the first renderer that matches wins.
 * Without `interactive` the component only draws: the layer keeps handling
 * the pointer. With `interactive` (or a function asked whenever it matters)
 * the component takes the pointer, and the annotation can't be selected or
 * moved while it does.
 *
 * Define the list once, outside your component or in `useMemo`: the layer
 * registers each entry, and a new list every render registers them again.
 *
 * `{ behavior, component }` draws what a sibling plugin's behavior owns (the
 * form plugin's fill controls); the plugin decides when it's engaged.
 */
export type AnnotationRenderer =
  | { behavior: string; component: React.ComponentType<BehaviorRendererProps> }
  | {
      /** A stable id for the registration (optional; generated). */
      id?: string;
      for: (annotation: Annotation) => boolean;
      component: React.ComponentType<AnnotationRendererProps>;
      interactive?: boolean | ((context: AnnotationInteractiveContext) => boolean);
      /**
       * Scale what you draw with the page (the default): you draw at the
       * annotation's 100% size. `false`: you draw at its size on screen, and
       * size things yourself from `frame.scale`.
       */
      scale?: boolean;
    };

/** What a handle component you draw yourself gets. */
export interface HandleProps {
  /** The handle's center, in pixels on the page. */
  at: Point;
  /** The `size` from the settings, px. */
  size: number;
  /** The selection's rotation (degrees clockwise), so a square handle can turn with it. */
  rotation: number;
  /** A box's `'corner'` or `'side'`, or one `'point'` of a line or a polygon. */
  kind: HandleRole;
  /** True while it's being dragged. */
  active: boolean;
}

/** What a rotation handle component gets: a handle's props, and where its stalk starts on the box. */
export interface RotationHandleProps extends Omit<HandleProps, 'kind'> {
  /** Where the stalk starts on the box, in pixels on the page. */
  from: Point;
}

/** Your own handles, drawn in place of the layer's. The viewer still decides where they can be grabbed. */
export interface AnnotationLayerComponents {
  Handle?: React.ComponentType<HandleProps>;
  RotationHandle?: React.ComponentType<RotationHandleProps>;
}

export interface AnnotationLayerProps {
  /** Your own look for some annotations ({@link AnnotationRenderer}). */
  renderers?: AnnotationRenderer[];
  /** Your own handles and rotation handle. */
  components?: AnnotationLayerComponents;
}

/** Content rect → a view-px box (the page wrapper's own coordinate space). */
function boxOf(rect: Rect, page: PageContextValue) {
  const tl = page.transform.toPixels({ x: rect.x, y: rect.y });
  const br = page.transform.toPixels({ x: rect.x + rect.width, y: rect.y + rect.height });
  return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y };
}

/** How much the layer scales the look around it: 1 outside a look, or in one drawn at its size on screen. */
const LookScaleContext = React.createContext(1);

/**
 * The box an annotation draws into, placed, sized and turned like the
 * annotation (`item.frame`) inside the page layer, which the page itself
 * turns. The annotation's own drawing and any look of yours draw inside it.
 */
function AnnotationFrame({
  item,
  page,
  interactive = false,
  inert = false,
  children,
}: {
  item: RenderItem;
  page: PageContextValue;
  interactive?: boolean;
  inert?: boolean;
  children: React.ReactNode;
}) {
  const box = frameInPixels(item.frame, page.transform);
  return (
    <div
      {...(inert ? INERT : {})}
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        transform: box.transform,
        transformOrigin: 'center',
        // On the frame: a turned frame groups what is inside it, so blending on
        // an inner element would stop blending with the page.
        mixBlendMode: item.blend,
        // An interactive renderer takes the pointer: the layer's own `none` ends here.
        pointerEvents: interactive ? 'auto' : 'none',
      }}
    >
      {children}
    </div>
  );
}

/** Map a core `Paint` to SVG presentation attributes — the whole framework-facing
 *  surface. Everything else about appearance is decided in the core's `scene`. */
function paintAttrs(paint: Paint) {
  return {
    fill: paint.fill ?? 'none',
    fillRule: paint.fillRule, // undefined → SVG default (nonzero); even-odd punches icon holes
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
 * size the <svg> to the box with a page-space `viewBox` and map each SceneNode
 * to one element, applying its `paint`. No per-kind logic, no bounds math — so
 * shapes, cloudy borders and every text-markup type all render here, and a Vue /
 * Svelte painter is the same ~10-line loop.
 */
/** How opaque a ghost paints: `--epdf-ghost-opacity` from CSS wins over the tool's own. */
const ghostOpacity = (opacity: number): string => paint('ghost-opacity', opacity);

/** The scene, filling the item's frame: drawn upright in it, the frame turns it. */
function Shape({ item }: { item: RenderItem }) {
  // Nothing to draw until the annotation has area (the 0×0 draft at mouse-down).
  if (item.box.width <= 0 || item.box.height <= 0) return null;
  // The viewBox (content units) and the <svg> on-screen size must stay proportional
  // (scale == zoom). Clamping either — e.g. a `max(1px)` floor on the element while
  // the viewBox keeps shrinking — decouples them, so a sub-pixel box scales content
  // up by ~1/size and a cloudy border's scallops flood the stage. No clamps here.
  const vb = `${item.box.x} ${item.box.y} ${item.box.width} ${item.box.height}`;
  return (
    <svg
      viewBox={vb}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
        // A ghost is see-through as a whole, so its fill and stroke don't stack.
        ...(item.source === 'ghost' ? { opacity: ghostOpacity(item.ghostOpacity ?? 0.5) } : {}),
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

/** The engine's raster inside the item's frame, where `item.raster` puts it, at any frame size. */
function BakedImage({ url, box }: { url: string; box: FrameFraction }) {
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        // The AP box is sized in content units; a global `img { max-width: 100% }`
        // reset would otherwise clamp it to the containing block and distort the
        // aspect. This bites specifically when the box is wider than that block —
        // a landscape stamp whose unrotated box overhangs a view-rotated (portrait)
        // page — so honour the explicit size.
        maxWidth: 'none',
        maxHeight: 'none',
        pointerEvents: 'none',
        // The turn the engine took out of the raster, put back about its middle.
        transform: box.transform,
        transformOrigin: 'center',
      }}
    />
  );
}

/**
 * The armed stamp's ghost: a see-through render of the payload drawn in the
 * exact box a click would place it (the plugin computes it with the same fit
 * + clamp as placement). Every other tool's ghost rides `pageItems` like a
 * drawing in progress. The preview bytes live in the capability closure; this
 * layer owns only the object-URL lifetime, keyed on the armed stamp — a new
 * arm swaps the image, a disarm (or tool change) drops it.
 */
function ToolGhostImage({ page }: { page: PageContextValue }) {
  const anno = useCapability(AnnotationHostToken);
  const ghost = useSelector(AnnotationHostToken, (annotation) =>
    annotation.getImageGhost(page.ref),
  );
  const armed = useSelector(AnnotationHostToken, (annotation) => annotation.getArmedStamp());
  const [url, setUrl] = useState<string | null>(null);
  // The ghost is a bitmap of vector artwork, right at one size: ask for the
  // bucket that covers the box's device width (points × device px per point),
  // so it stays sharp at every zoom and density. The plugin caches per bucket.
  const bucket = ghost ? previewBucket(ghost.box.width * page.transform.renderScale) : 0;

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

  if (!ghost || !url) return null;
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
        opacity: ghostOpacity(ghost.opacity),
        ...(ghost.rot ? { transform: `rotate(${ghost.rot}deg)`, transformOrigin: 'center' } : {}),
      }}
    />
  );
}

// ── the selection's chrome ───────────────────────────────────────────────────

/** Every chrome color, width and dash as CSS: its variable first, then the setting. */
interface ChromePaint {
  readonly outline: React.CSSProperties;
  readonly handle: React.CSSProperties;
  readonly rotationHandle: React.CSSProperties;
  readonly guide: React.CSSProperties;
  readonly rotationGuide: React.CSSProperties;
  readonly marquee: React.CSSProperties;
}

/**
 * The chrome settings as paint. A color left `null` follows the part it
 * names, and in the end the accent: the setting's own, else the viewer's.
 */
function chromePaint(chrome: ChromeSettings, viewerAccent: string): ChromePaint {
  const accent = chrome.accent ?? viewerAccent;
  const guideLine = {
    strokeWidth: paint('annotation-guide-width', chrome.guides.width),
    strokeDasharray: paint('annotation-guide-dash', chrome.guides.style),
  };
  return {
    outline: {
      stroke: paint('annotation-outline', chrome.outline.color ?? accent),
      strokeWidth: paint('annotation-outline-width', chrome.outline.width),
      strokeDasharray: paint('annotation-outline-dash', chrome.outline.style),
    },
    handle: {
      fill: paint('annotation-handle-fill', chrome.handles.fill),
      stroke: paint('annotation-handle-stroke', chrome.handles.stroke ?? accent),
    },
    rotationHandle: {
      fill: paint(
        'annotation-rotation-handle-fill',
        chrome.rotationHandle.fill ?? chrome.handles.fill,
      ),
      stroke: paint(
        'annotation-rotation-handle-stroke',
        chrome.rotationHandle.stroke ?? chrome.handles.stroke ?? accent,
      ),
    },
    guide: { stroke: paint('annotation-guide', chrome.guides.color), ...guideLine },
    rotationGuide: {
      stroke: paint('annotation-rotation-guide', chrome.guides.rotationColor ?? accent),
      ...guideLine,
    },
    marquee: {
      fill: paint(
        'annotation-marquee-fill',
        chrome.marquee.fill ?? mixAccent('annotation-marquee-fill', accent),
      ),
      stroke: paint('annotation-marquee-stroke', chrome.marquee.stroke ?? accent),
    },
  };
}

/** The chrome settings, painted: follows the settings and the viewer's accent live. */
function useChromePaint(): { chrome: ChromeSettings; painted: ChromePaint } {
  const chrome = useAnnotationSettings((settings) => settings.chrome);
  const accent = useViewerSettings((settings) => settings.accent);
  const painted = React.useMemo(() => chromePaint(chrome, accent), [chrome, accent]);
  return { chrome, painted };
}

/** A handle as the layer draws it: a square or a circle, `size` px across. */
function DefaultHandle({
  at,
  size,
  rotation,
  shape,
  style,
}: {
  at: Point;
  size: number;
  rotation: number;
  shape: 'square' | 'circle';
  style: React.CSSProperties;
}) {
  if (shape === 'circle') {
    return <circle cx={at.x} cy={at.y} r={size / 2} strokeWidth={1.5} style={style} />;
  }
  return (
    <rect
      x={at.x - size / 2}
      y={at.y - size / 2}
      width={size}
      height={size}
      strokeWidth={1.5}
      style={style}
      // The square rides a rotated box's orientation (spin about itself).
      {...(rotation ? { transform: `rotate(${rotation} ${at.x} ${at.y})` } : {})}
    />
  );
}

function Chrome({
  page,
  components,
}: {
  page: PageContextValue;
  components?: AnnotationLayerComponents;
}) {
  // The page's view scale converts the screen-pixel chrome settings into
  // content units inside the plugin (rotation handle offset, grab zones):
  // screen-constant at every zoom. What this draws is in screen pixels already.
  const scale = page.transform.viewScale;
  const rotation = page.transform.rotation;
  const zoom = page.transform.zoom;
  const nodes = useSelector(
    AnnotationHostToken,
    (annotation) => annotation.listChromeNodes(page.ref, scale, rotation, zoom),
    shallowArray,
  );
  const { chrome, painted } = useChromePaint();
  const Handle = components?.Handle;
  const RotationHandle = components?.RotationHandle;
  // Your own handles draw as HTML over the page; the layer's as SVG.
  const custom: React.ReactNode[] = [];
  const svg = nodes.map((node: ChromeNode, i) => {
    if (node.kind === 'handle') {
      const at = page.transform.toPixels(node.at);
      if (Handle) {
        custom.push(
          <Handle
            key={i}
            at={at}
            size={chrome.handles.size}
            rotation={node.rot ?? 0}
            kind={node.role}
            active={node.active}
          />,
        );
        return null;
      }
      return (
        <DefaultHandle
          key={i}
          at={at}
          size={chrome.handles.size}
          rotation={node.rot ?? 0}
          shape={chrome.handles.shape}
          style={painted.handle}
        />
      );
    }
    // A live alignment guide of a snapped move: a through-line at the snapped
    // edge or center, spanning both shapes.
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
          shapeRendering="crispEdges"
          style={painted.guide}
        />
      );
    }
    // An oriented selection box (a tilted shape or group): a closed quad
    // through the four page-space corners, in place of the axis-aligned outline.
    if (node.kind === 'obb') {
      const svgPoints = node.corners
        .map((point) => {
          const pixel = page.transform.toPixels(point);
          return `${pixel.x},${pixel.y}`;
        })
        .join(' ');
      return <polygon key={i} points={svgPoints} fill="none" style={painted.outline} />;
    }
    // Rotation guides (a live turn only): a faint 0°/90° reference cross and
    // the line riding the angle, already cut to the page.
    if (node.kind === 'rotate-guides') {
      return (
        <g key={i}>
          {node.lines.map((chord, j) => {
            const start = page.transform.toPixels(chord.a);
            const end = page.transform.toPixels(chord.b);
            return (
              <line
                key={j}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                opacity={chord.role === 'axis' ? 0.35 : 0.8}
                style={painted.rotationGuide}
              />
            );
          })}
        </g>
      );
    }
    // The rotation handle: a stalk from the box's edge out to a round handle.
    if (node.kind === 'rotate-knob') {
      const at = page.transform.toPixels(node.at);
      const from = page.transform.toPixels(node.from);
      if (RotationHandle) {
        custom.push(
          <RotationHandle
            key={i}
            at={at}
            from={from}
            size={chrome.rotationHandle.size}
            rotation={0}
            active={false}
          />,
        );
        return null;
      }
      return (
        <g key={i}>
          {chrome.rotationHandle.stalk && (
            <line
              x1={from.x}
              y1={from.y}
              x2={at.x}
              y2={at.y}
              strokeWidth={1}
              style={{ stroke: painted.rotationHandle.stroke }}
            />
          )}
          <circle
            cx={at.x}
            cy={at.y}
            r={chrome.rotationHandle.size / 2}
            strokeWidth={1.5}
            style={painted.rotationHandle}
          />
        </g>
      );
    }
    const frame = boxOf(node.rect, page);
    // The box dragged to select keeps its own look (a see-through accent
    // fill, always dashed); the selection outline follows the settings.
    if (node.kind === 'marquee') {
      return (
        <rect
          key={i}
          x={frame.left}
          y={frame.top}
          width={frame.width}
          height={frame.height}
          strokeWidth={1}
          strokeDasharray="4 3"
          style={painted.marquee}
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
        style={painted.outline}
      />
    );
  });
  return (
    <>
      <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {svg}
      </svg>
      {custom.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{custom}</div>
      )}
    </>
  );
}

// ── text boxes ───────────────────────────────────────────────────────────────

/**
 * Make an element the editor of a text box: the shared
 * `attachRichTextEditor` binding renders the runs as inline-styled spans,
 * turns typing back into runs, maps the selection to flat offsets and keeps
 * the caret through a restyle; the browser owns layout, caret, input methods
 * and the clipboard; the plugin owns the text, the range routing and the
 * write after a pause. `contentEditable` follows `item.editing`, so the text
 * never jumps between reading and typing.
 */
function useTextBoxEditor(
  item: TextItem | null,
  scale: number,
): (element: HTMLElement | null) => void {
  const anno = useCapability(AnnotationHostToken);
  const [element, setElement] = useState<HTMLElement | null>(null);
  // The binding outlives renders; the host closes over the latest item.
  const binding = useRef<RichTextEditorBinding | null>(null);
  const latest = useRef({ item, scale });
  latest.current = { item, scale };
  useEffect(() => {
    if (!element || !latest.current.item) return;
    const host: RichTextEditorHost = {
      // Typing shows at once and reaches the engine in one write after a
      // pause (or when the edit ends), not one write per keystroke.
      onInput: (doc) => {
        const it = latest.current.item;
        if (it?.ref) anno.draftRichText(it.ref, doc);
      },
      onSelectionChange: (range) => {
        const it = latest.current.item;
        if (it?.ref) anno.setTextSelection(it.ref, range);
      },
      onCommand: (command) => anno.text.toggleFormat(command),
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
    // The binding is made once per element; it follows the item below.
  }, [anno, element, !!item]);
  // Model → DOM: the binding skips its own echo (so the caret never jumps
  // while typing) and re-renders, caret kept, for a restyle, a remote edit or
  // a zoom. It runs on every item change; the binding redraws only when the
  // text differs, and otherwise states the line model for the (maybe
  // restyled) font again.
  useEffect(() => {
    if (item) binding.current?.update({ document: item.richText, scale });
  }, [item, scale]);

  const editing = item?.editing ?? false;
  // Focus follows the model's `editing`, never the other way: leaving is
  // driven by the hub, so a passing focus steal can't end the edit.
  useEffect(() => {
    if (!element) return;
    element.contentEditable = editing ? 'true' : 'false';
    if (editing) {
      element.focus();
      // Enter at the top, where the baked appearance anchors the text, so
      // baked → edit → baked never jumps.
      element.scrollTop = 0;
    }
  }, [element, editing]);

  // A press inside the editor stays there: it must not reach the Stage's
  // listener, which reads it as a click outside (and ends the edit). The
  // browser then owns the caret and the drag inside the box.
  useEffect(() => {
    if (!element) return;
    const stop = (event: Event) => event.stopPropagation();
    // The gesture that opens the editor blurs it to <body> right after it
    // takes focus; while the model still edits this box, take focus back. A
    // real click away ends the edit through the hub first.
    const refocus = (event: FocusEvent) => {
      const it = latest.current.item;
      if (event.relatedTarget == null && element.isConnected && it && anno.getEditingId() === it.id)
        element.focus();
    };
    element.addEventListener('pointerdown', stop);
    element.addEventListener('blur', refocus);
    return () => {
      element.removeEventListener('pointerdown', stop);
      element.removeEventListener('blur', refocus);
    };
  }, [anno, element]);

  return setElement;
}

/** A text box's body style as CSS at a scale: font, size, color and alignment. */
function textStyleOf(item: TextItem, scale: number): React.CSSProperties {
  return {
    fontFamily: item.css.fontFamily,
    fontSize: item.css.fontSize * scale,
    // No line height: the binding states the engine's line model per face.
    color: item.css.color,
    fontWeight: item.css.fontWeight,
    fontStyle: item.css.fontStyle,
    textDecoration: item.css.textDecoration,
    textAlign: item.css.align,
  };
}

/** A free text annotation: the same styled element for reading and typing. */
function FreeText({ item, page }: { item: TextItem; page: PageContextValue }) {
  const box = boxOf(item.box, page);
  const scale = item.box.width > 0 ? box.width / item.box.width : 1; // content units → screen px
  const ref = useTextBoxEditor(item, scale);
  const textOutline = useAnnotationSettings((settings) => settings.chrome.textOutline);
  const accent = useViewerSettings((settings) => settings.accent);
  const outlineAccent = useAnnotationSettings((settings) => settings.chrome.accent);
  // The element is the engine's text plate (`SetPlateRect` and its `re W n`
  // clip): positioned at the padding inset with no CSS padding, so its edge
  // is the plate's. CSS padding doesn't clip overflow: scrolled lines would
  // paint over the border band.
  const pad = item.css.padding * scale;
  return (
    <div
      ref={ref}
      suppressContentEditableWarning
      style={{
        position: 'absolute',
        left: box.left + pad,
        top: box.top + pad,
        width: Math.max(0, box.width - 2 * pad),
        // Fixed to the plate: the box never grows with its text; it scrolls
        // while typing and clips otherwise, where the baked /AP clips.
        height: Math.max(0, box.height - 2 * pad),
        ...textStyleOf(item, scale),
        boxSizing: 'border-box',
        // The box's fill and border are the vector scene's, under this layer.
        background: 'transparent',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        overflowY: item.editing ? 'auto' : 'hidden',
        overflowX: 'hidden',
        outline: item.editing
          ? `1px solid ${paint('annotation-text-outline', textOutline ?? outlineAccent ?? accent)}`
          : 'none',
        cursor: item.editing ? 'text' : 'default',
        // A plain text box turns about its centre, as the baked /AP does.
        ...(item.rot ? { transform: `rotate(${item.rot}deg)`, transformOrigin: 'center' } : {}),
        // Not typing: clicks fall through to the shapes (select, move, resize).
        pointerEvents: item.editing ? 'auto' : 'none',
      }}
    />
  );
}

/** What `useRichTextEditor()` gives the element you draw a text box with. */
export interface RichTextEditor {
  /** Put it on your element: it becomes the editor. */
  ref: (element: HTMLElement | null) => void;
  /** The box's body style as CSS: font, size, color and alignment. While typing it takes the pointer too. */
  style: React.CSSProperties;
  /** True while someone types in the box. */
  editing: boolean;
}

const NO_STYLE: React.CSSProperties = {};

/**
 * Make your own element the editor of a text box you draw yourself (a
 * renderer for free text): it draws the runs, turns typing back into runs,
 * keeps the caret when the style changes, and handles pasting, input methods
 * and the format shortcuts. The formatting calls (`text.toggleFormat`,
 * `selection.update`) work on it as they do on the built-in one.
 */
export function useRichTextEditor(annotation: Annotation): RichTextEditor {
  const page = usePage();
  const zoom = page.transform.zoom;
  const rotation = page.transform.rotation;
  const key = annotationKey(annotation.ref);
  const item = useOptionalSelector(
    AnnotationHostToken,
    (anno) =>
      anno
        .listTextItems(page.ref, { zoom, rotation })
        .find((text) => text.ref !== null && annotationKey(text.ref) === key) ?? null,
    null,
  );
  // Pixels per point where the element is: inside a scaled look, at the
  // annotation's 100% size; the look's scale does the rest.
  const lookScale = React.useContext(LookScaleContext);
  const scale =
    (item && item.box.width > 0
      ? boxOf(item.box, page).width / item.box.width
      : page.transform.viewScale) / lookScale;
  const ref = useTextBoxEditor(item, scale);
  // While typing, the element takes the pointer (the caret, a drag over words).
  const style = React.useMemo<React.CSSProperties>(
    () =>
      item
        ? { ...textStyleOf(item, scale), ...(item.editing ? { pointerEvents: 'auto' } : {}) }
        : NO_STYLE,
    [item, scale],
  );
  return { ref, style, editing: item?.editing ?? false };
}

// ── renderers that take the pointer ──────────────────────────────────────────

/**
 * The behaviors `interactive` renderers register, counted per (capability,
 * entry) because the layer mounts once per page: the first page registers,
 * the last unregisters. Entry identity is the key, hence the "define entries
 * outside render" rule on {@link AnnotationRenderer}.
 */
const autoBehaviors = new WeakMap<
  object,
  Map<object, { id: string; count: number; unregister: () => void }>
>();
let autoBehaviorSeq = 0;

function useAutoBehaviors(
  anno: { registerBehavior(behavior: Behavior): () => void },
  activeToolId: () => string,
  renderers?: AnnotationRenderer[],
): void {
  const toolRef = useRef(activeToolId);
  toolRef.current = activeToolId;
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
        const interactive = renderer.interactive;
        const engaged =
          typeof interactive === 'function'
            ? (annotation: Annotation) => interactive({ annotation, toolId: toolRef.current() })
            : () => true;
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

/** React 18 spells the `inert` attribute as a string spread; it disables
 *  pointer and focus for the whole subtree: a renderer that only draws can
 *  never take the pointer. */
const INERT = { inert: '' } as Record<string, string>;

/**
 * Draws a page's annotations, the selection's outline and handles, the tool's
 * preview and the text boxes being typed in. Put it above the rendered page,
 * with the render layer leaving annotations out (`annotations={false}`).
 */
export function AnnotationLayer({ renderers, components }: AnnotationLayerProps = {}) {
  const page = usePage();
  const anno = useCapability(AnnotationHostToken);
  // The active tool decides which interactive renderers take the pointer, so
  // a tool change repaints the layer (`interactive` functions read it live).
  useOptionalSelector(InteractionToken, (interaction) => interaction.getActiveToolId(), '');
  const interaction = useOptionalCapability(InteractionToken);
  // The page's view env (relative zoom + total display rotation) projects
  // screen-anchored (`noZoom`/`noRotate`) annotations to their effective
  // footprint inside the plugin: no flag logic lives in the framework.
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
  useAutoBehaviors(anno, () => (interaction?.getActiveToolId() as string) ?? '', renderers);
  usePageLayerFact(page, 'annotationRenderers', renderers ?? null);
  // Entry identity keys the behavior registration, so an inline `renderers`
  // array registers again on every render. Detect it once: a fresh array
  // whose entries are the previous ones.
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

  // Baked annotations render from engine rasters: fetch again when the
  // page's baked set or an /AP version changes (a freshly placed stamp, a
  // resize whose re-bake resolved), and at appearance-scale crossings. A move
  // or a turn leaves the epoch as it is (the blit repositions the same
  // pixels), and live gestures don't touch it either: no mid-drag fetches.
  const bakedKey = useSelector(AnnotationHostToken, (annotation) =>
    annotation.getAppearanceEpoch(page.ref),
  );
  // The bake scale follows the document's render policy: zoom ticks inside an
  // appearance-lattice rung re-bake nothing; crossing 1→2 re-bakes once.
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
          // Place the baked bitmap by its own rect (the box it was rendered
          // into, in page space), never a recomputed bound.
          const box = ap.rect;
          const obj = await ap.image.objectUrl().abortWith(controller.signal);
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

  /** The text box being typed in, by key. */
  const editingText = texts.find((text) => text.editing && text.ref !== null);
  const editingKey = editingText?.ref ? annotationKey(editingText.ref) : null;

  /** Whether one of your renderers draws this text box: the item it is on the page has a renderer. */
  const drawnByRenderer = (text: TextItem): boolean => {
    if (!renderers || !text.ref) return false;
    const key = annotationKey(text.ref);
    const annotation = items.find(
      (item) => item.ref !== null && annotationKey(item.ref) === key,
    )?.annotation;
    return (
      !!annotation && renderers.some((renderer) => 'for' in renderer && renderer.for(annotation))
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {items.map((item) => {
        // The default look, inside the item's frame: the engine's raster where
        // the core places it (following a move as it happens), or the scene.
        const baked = urls[item.id];
        const native: React.ReactNode =
          item.source === 'baked' ? (
            baked && item.raster ? (
              <BakedImage url={baked.url} box={rasterInFrame(item.raster, item.frame)} />
            ) : null
          ) : (
            // shapes, cloudy, markup: all painted via scene()
            <Shape item={item} />
          );
        const framed = (
          content: React.ReactNode,
          options?: { interactive?: boolean; inert?: boolean },
        ) => (
          <AnnotationFrame key={item.id} item={item} page={page} {...options}>
            {content}
          </AnnotationFrame>
        );
        const annotation = item.annotation;
        if (!annotation) return framed(native);
        /** Your look in the frame: drawn at the annotation's 100% size and scaled with the page, unless it opts out. */
        const look = (
          entry: Extract<AnnotationRenderer, { for: unknown }>,
          interactive: boolean,
        ): React.ReactNode => {
          const pixels = frameInPixels(item.frame, page.transform);
          const scaled = entry.scale !== false;
          const Look = entry.component;
          const drawn = (
            <Look
              annotation={annotation}
              frame={{
                width: scaled ? pixels.design.width : pixels.width,
                height: scaled ? pixels.design.height : pixels.height,
                rotation: pixels.rotationOnScreen,
                scale: pixels.scale,
              }}
              native={native}
              appearance={baked ? { url: baked.url } : null}
              hovered={item.hovered ?? false}
              selected={item.selected}
              interactive={interactive}
            />
          );
          if (!scaled) return drawn;
          return (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: pixels.design.width,
                height: pixels.design.height,
                transform: `scale(${pixels.scale})`,
                transformOrigin: '0 0',
              }}
            >
              <LookScaleContext.Provider value={pixels.scale}>{drawn}</LookScaleContext.Provider>
            </div>
          );
        };

        // Ownership beats looks: an engaged behavior's renderer is
        // authoritative (form fill controls own their DOM); `for` rules apply
        // only to what the layer owns, and draw without the pointer.
        const behavior = anno.getBehaviorFor(annotation);
        if (behavior) {
          const entry = renderers?.find(
            (renderer) => rendererBehaviorId(anno, renderer) === behavior.id,
          );
          if (entry && 'behavior' in entry) {
            // Its controls place themselves in the layer; the native drawing keeps its frame.
            const Owner = entry.component;
            return (
              <Owner
                key={item.id}
                annotation={annotation}
                item={item}
                page={page}
                native={framed(native)}
                hovered={item.hovered ?? false}
                selected={item.selected}
                interactive
              />
            );
          }
          if (entry) return framed(look(entry, true), { interactive: true });
          // Engaged with no renderer wired: the behavior's plugin owns the
          // input (a link's anchor takes the click), and the annotation keeps
          // its own look.
          return framed(native, { inert: true });
        }
        const entry = renderers?.find(
          (renderer): renderer is Extract<AnnotationRenderer, { for: unknown }> =>
            'for' in renderer && renderer.for(annotation),
        );
        if (!entry) return framed(native);
        // While its text box is typed in, the renderer's editor
        // (`useRichTextEditor`) takes the keys: an inert subtree can't.
        const typing = editingKey !== null && annotationKey(annotation.ref) === editingKey;
        return framed(look(entry, false), { inert: !typing });
      })}
      {texts.map((text) =>
        // A text box your renderer draws is edited there (`useRichTextEditor`).
        drawnByRenderer(text) ? null : <FreeText key={text.id} item={text} page={page} />,
      )}
      <ToolGhostImage page={page} />
      <Chrome page={page} components={components} />
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

export function useAnnotation(): AnnotationCapability {
  return useCapability(AnnotationToken);
}

/** Listen to one annotation event while the component is mounted: `useAnnotationEvent((annotation) => annotation.onCreated, handler)`. */
export function useAnnotationEvent<T>(
  select: (annotation: AnnotationCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(AnnotationToken, select, handler);
}

const NO_ANNOTATIONS: readonly Annotation[] = [];

/**
 * The annotations matching `filter` (some pages, one kind), in drawing order,
 * as the user sees them; the same array while they stay the same. Empty
 * without a document.
 */
export function useAnnotationList(filter?: AnnotationFilter): readonly Annotation[] {
  const key = filter
    ? `${(filter.pages ?? [])
        .map((page) => (typeof page === 'number' ? `#${page}` : page.objectNumber))
        .join(',')}|${filter.pages ? 'p' : ''}|${filter.subtype ?? ''}`
    : '';
  // Keyed by value, so an inline filter object never subscribes again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = React.useMemo(() => filter, [key]);
  return useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.list(stable),
    NO_ANNOTATIONS,
    shallowArray,
  );
}

const NO_DEFAULTS: ToolDefaults = {};

/**
 * A tool's defaults: the fields its next annotation starts with, over the
 * engine's. The component re-renders when they change, so a color picker
 * always shows the current color. Empty without a document.
 */
export function useAnnotationDefaults(toolId: string): ToolDefaults {
  return useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.tools.getDefaults(toolId),
    NO_DEFAULTS,
  );
}

const NO_PROPERTIES: AnnotationProperties = { properties: [], values: {}, mixed: [] };

/**
 * What a style panel shows: the selection's properties (`selection.getProperties()`),
 * or, given a tool id, the tool's (`tools.getProperties(id)`). The component
 * re-renders when they change. Empty without a document.
 */
export function useAnnotationProperties(toolId?: string): AnnotationProperties {
  return useOptionalSelector(
    AnnotationToken,
    (annotation) =>
      toolId === undefined
        ? annotation.selection.getProperties()
        : annotation.tools.getProperties(toolId),
    NO_PROPERTIES,
  );
}

/**
 * An anchor for `<Anchored>` that keeps a card or a badge attached to one
 * annotation: its page and the box around what it shows, following a move
 * as it happens. `null` for `null`, or an annotation that isn't here. The
 * component re-renders when the annotation moves, not while people scroll or
 * zoom: a note that keeps its size on screen hands `<Anchored>` its
 * `boundsIn`.
 */
export function useAnnotationAnchor(ref: AnnotationRef | null): AnnotationAnchor | null {
  const key = ref ? annotationKey(ref) : null;
  // Keyed by value, so an inline ref never subscribes again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = React.useMemo(() => ref, [key]);
  return useOptionalSelector(
    AnnotationHostToken,
    (annotation) => (stable ? annotation.getAnnotationAnchor(stable) : null),
    null,
    sameAnnotationAnchor,
  );
}

/** The same anchor: page, box, and how it follows the view. */
const sameAnnotationAnchor = (
  left: AnnotationAnchor | null,
  right: AnnotationAnchor | null,
): boolean =>
  left === right ||
  (!!left &&
    !!right &&
    left.page.objectNumber === right.page.objectNumber &&
    left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height &&
    left.boundsIn === right.boundsIn);

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
}

/** Pure join behind {@link useCommentThreads} — exported for tests. */
export function enrichCommentThreads(
  threads: readonly CommentThread[],
  pages: readonly PageLayout[],
): CommentThreadView[] {
  const byPageObjectNumber = new Map(
    pages.map((pageInfo) => [pageInfo.ref.objectNumber, pageInfo] as const),
  );
  return threads.map((thread) => {
    const page = byPageObjectNumber.get(thread.page.objectNumber);
    return {
      ...thread,
      pageIndex: page ? page.index : -1,
      pageLabel: page ? (page.label ?? String(page.index + 1)) : '?',
    };
  });
}

/** The comments API: the `comments` part of `useAnnotation()`. Pair it with
 *  {@link useCommentThreads} for the threads to show. */
export function useComments(): CommentsApi {
  return useCapability(AnnotationToken).comments;
}

const EMPTY_PAGES: readonly PageLayout[] = [];
const NO_THREADS: readonly CommentThread[] = [];

/**
 * Every comment thread in the document, display-ordered (page position →
 * top of page → creation date) and enriched with `pageIndex`/`pageLabel`.
 * Subscribed to both stores: annotation writes (own, remote, hydration)
 * recompute the threads; page moves/deletes re-run the join. Reference-
 * stable between changes — safe to memo child renders on the array.
 */
export function useCommentThreads(): CommentThreadView[] {
  const docId = useDocumentId();
  const threads = useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.comments.listThreads(),
    NO_THREADS,
  );
  const pages = useKernelValue((kernel) =>
    docId ? kernel.documents.listPages(docId) : EMPTY_PAGES,
  );
  return React.useMemo(() => enrichCommentThreads(threads, pages), [threads, pages]);
}

/** The enriched thread containing any member ref (root, reply, grouped part,
 *  state annotation), or null. */
export function useCommentThread(ref: AnnotationRef | null): CommentThreadView | null {
  const views = useCommentThreads();
  const api = useOptionalCapability(AnnotationToken);
  if (ref == null || !api) return null;
  const thread = api.comments.getThread(ref);
  if (!thread) return null;
  return (
    views.find((view) => annotationKey(view.root.ref) === annotationKey(thread.root.ref)) ?? null
  );
}
