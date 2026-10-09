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
 * What isn't React lives in `@embedpdf/web`, the same for every framework:
 * the scene as SVG elements, the chrome's paint and pixels, the text box
 * editor, which drawing each annotation gets and the behaviors renderers
 * register, and the object URLs of baked appearances and the stamp ghost.
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
  type FieldValues,
  type Point,
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
  annotationChromePaint,
  annotationDrawingOf,
  bakedAppearanceOf,
  chromeInPixels,
  createTextBoxEditorFollower,
  editingTextKeyOf,
  enrichCommentThreads,
  frameInPixels,
  ghostOpacity,
  installFilePickerProvider,
  layerTextBoxesOf,
  loadAppearanceUrls,
  loadObjectUrl,
  lookFrameOf,
  pickRequestedFile,
  rasterInFrame,
  rectInPixels,
  registerRendererBehaviors,
  sameAnnotationAnchor,
  sceneViewBox,
  svgShapesOf,
  textBoxEditorScaleOf,
  textBoxStyleOf,
  textPlateInPixels,
  type AnnotationChromePaint,
  type AppearanceUrl,
  type FrameFraction,
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
import { usePaintsPagePart } from './page-layers';
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

/** SVG attribute names as React props: `stroke-width` is `strokeWidth`. */
function reactProps(attributes: Readonly<Record<string, string | number>>) {
  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [
      name.replace(/-([a-z])/g, (_dash, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}

/**
 * The scene, filling the item's frame: drawn upright in it, the frame turns
 * it. The core computed the box and the painted scene; `@embedpdf/web`
 * describes each scene node as one SVG element, so there is no per-kind
 * logic and no bounds math here.
 */
function Shape({ item }: { item: RenderItem }) {
  // Nothing to draw until the annotation has area (the 0×0 draft at mouse-down).
  const viewBox = sceneViewBox(item.box);
  if (!viewBox) return null;
  return (
    <svg
      viewBox={viewBox}
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
      {svgShapesOf(scene(item), { miterLimit: MITER_LIMIT }).map((shape, i) =>
        React.createElement(
          shape.tag,
          {
            key: i,
            ...reactProps(shape.attributes),
            ...(shape.blend
              ? { style: { mixBlendMode: shape.blend as React.CSSProperties['mixBlendMode'] } }
              : {}),
          },
          shape.text,
        ),
      )}
    </svg>
  );
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
    // The previous bucket's image stays up until this one resolves: no
    // flicker while a zoom crosses a bucket boundary.
    return loadObjectUrl(() => anno.renderArmedStampPreview(bucket), setUrl);
  }, [anno, armed, bucket]);

  if (!ghost || !url) return null;
  const frame = rectInPixels(ghost.box, page.transform);
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

/** The chrome settings, painted: follows the settings and the viewer's accent live. */
function useChromePaint(): { chrome: ChromeSettings; painted: AnnotationChromePaint } {
  const chrome = useAnnotationSettings((settings) => settings.chrome);
  const accent = useViewerSettings((settings) => settings.accent);
  const painted = React.useMemo(() => annotationChromePaint(chrome, accent), [chrome, accent]);
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
  const svg = chromeInPixels(nodes, page.transform).map((node, i) => {
    switch (node.kind) {
      case 'handle':
        if (Handle) {
          custom.push(
            <Handle
              key={i}
              at={node.at}
              size={chrome.handles.size}
              rotation={node.rotation}
              kind={node.role}
              active={node.active}
            />,
          );
          return null;
        }
        return (
          <DefaultHandle
            key={i}
            at={node.at}
            size={chrome.handles.size}
            rotation={node.rotation}
            shape={chrome.handles.shape}
            style={painted.handle}
          />
        );
      case 'guide':
        return (
          <line
            key={i}
            x1={node.from.x}
            y1={node.from.y}
            x2={node.to.x}
            y2={node.to.y}
            shapeRendering="crispEdges"
            style={painted.guide}
          />
        );
      case 'turned-outline':
        return <polygon key={i} points={node.points} fill="none" style={painted.outline} />;
      case 'rotation-guides':
        return (
          <g key={i}>
            {node.lines.map((line, j) => (
              <line
                key={j}
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                opacity={line.opacity}
                style={painted.rotationGuide}
              />
            ))}
          </g>
        );
      case 'rotation-handle':
        if (RotationHandle) {
          custom.push(
            <RotationHandle
              key={i}
              at={node.at}
              from={node.from}
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
                x1={node.from.x}
                y1={node.from.y}
                x2={node.at.x}
                y2={node.at.y}
                strokeWidth={1}
                style={{ stroke: painted.rotationHandle.stroke }}
              />
            )}
            <circle
              cx={node.at.x}
              cy={node.at.y}
              r={chrome.rotationHandle.size / 2}
              strokeWidth={1.5}
              style={painted.rotationHandle}
            />
          </g>
        );
      // The box dragged to select keeps its own look (a see-through accent
      // fill, always dashed); the selection outline follows the settings.
      case 'marquee':
        return (
          <rect
            key={i}
            x={node.box.left}
            y={node.box.top}
            width={node.box.width}
            height={node.box.height}
            strokeWidth={1}
            strokeDasharray="4 3"
            style={painted.marquee}
          />
        );
      case 'outline':
        return (
          <rect
            key={i}
            x={node.box.left}
            y={node.box.top}
            width={node.box.width}
            height={node.box.height}
            fill="none"
            style={painted.outline}
          />
        );
    }
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
 * Make an element the editor of a text box: `@embedpdf/web`'s text box
 * editor binds it (rich text, focus and `contentEditable` following
 * `item.editing`, presses kept inside), and its follower attaches again for
 * another element or document and hands it the item and the scale. Returns
 * the ref callback for the element.
 */
function useTextBoxEditor(
  item: TextItem | null,
  scale: number,
): (element: HTMLElement | null) => void {
  const anno = useCapability(AnnotationHostToken);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [follower] = useState(() => createTextBoxEditorFollower<AnnotationRef>());
  // On every item or scale change too: the editor redraws only when the text differs.
  useEffect(
    () => follower.follow(element, anno, item, scale),
    [follower, anno, element, item, scale],
  );
  useEffect(() => () => follower.detach(), [follower]);
  return setElement;
}

/** A free text annotation: the same styled element for reading and typing. */
function FreeText({ item, page }: { item: TextItem; page: PageContextValue }) {
  // The element is the engine's text plate: the box inset by its padding.
  const plate = textPlateInPixels(item, page.transform);
  const ref = useTextBoxEditor(item, plate.scale);
  const { painted } = useChromePaint();
  return (
    <div
      ref={ref}
      suppressContentEditableWarning
      style={{
        position: 'absolute',
        left: plate.left,
        top: plate.top,
        width: plate.width,
        // Fixed to the plate: the box never grows with its text; it scrolls
        // while typing and clips otherwise, where the baked /AP clips.
        height: plate.height,
        ...textBoxStyleOf(item.css, plate.scale),
        boxSizing: 'border-box',
        // The box's fill and border are the vector scene's, under this layer.
        background: 'transparent',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        overflowY: item.editing ? 'auto' : 'hidden',
        overflowX: 'hidden',
        outline: item.editing ? `1px solid ${painted.textOutline}` : 'none',
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
  const scale = textBoxEditorScaleOf(item, page.transform, React.useContext(LookScaleContext));
  const ref = useTextBoxEditor(item, scale);
  // While typing, the element takes the pointer (the caret, a drag over words).
  const style = React.useMemo<React.CSSProperties>(
    () =>
      item
        ? { ...textBoxStyleOf(item.css, scale), ...(item.editing ? { pointerEvents: 'auto' } : {}) }
        : NO_STYLE,
    [item, scale],
  );
  return { ref, style, editing: item?.editing ?? false };
}

// ── renderers that take the pointer ──────────────────────────────────────────

/**
 * Register the behaviors this layer's `interactive` renderers need, through
 * `@embedpdf/web`'s `registerRendererBehaviors`: counted per capability and
 * entry, since the layer mounts once per page. Entry identity is the key,
 * hence the "define entries outside render" rule on {@link AnnotationRenderer}.
 */
function useRendererBehaviors(
  anno: Parameters<typeof registerRendererBehaviors<Annotation>>[0],
  activeToolId: () => string,
  renderers?: AnnotationRenderer[],
): void {
  const toolRef = useRef(activeToolId);
  toolRef.current = activeToolId;
  useEffect(() => {
    if (!renderers) return;
    return registerRendererBehaviors(anno, renderers, () => toolRef.current());
  }, [anno, renderers]);
}

/** React 18 spells the `inert` attribute as a string spread; it disables
 *  pointer and focus for the whole subtree: a renderer that only draws can
 *  never take the pointer. */
const INERT = { inert: '' } as Record<string, string>;

/**
 * Draws a page's annotations, the selection's outline and handles, the tool's
 * preview and the text boxes being typed in. Put it above the rendered page:
 * while it's there, the render layer leaves the annotations out of the
 * page's picture.
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
  const [urls, setUrls] = useState<Record<string, AppearanceUrl>>({});
  useRendererBehaviors(anno, () => (interaction?.getActiveToolId() as string) ?? '', renderers);
  usePaintsPagePart(page.ref, 'annotations');
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

  useEffect(
    () =>
      loadAppearanceUrls(
        (signal) => anno.renderAppearances(page.ref, bakeScale, signal),
        annotationKey,
        setUrls,
      ),
    [anno, page.ref, bakeScale, bakedKey],
  );

  /** The text box being typed in, by key. */
  const editingKey = editingTextKeyOf(texts, annotationKey);

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
              frame={lookFrameOf(pixels, scaled)}
              native={native}
              appearance={bakedAppearanceOf(urls, item.id)}
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
        // only to what the layer owns, and draw without the pointer. While its
        // text box is typed in, a look's editor (`useRichTextEditor`) takes
        // the keys: an inert subtree can't.
        const typing = editingKey !== null && annotationKey(annotation.ref) === editingKey;
        const drawing = annotationDrawingOf(annotation, anno, renderers, typing);
        switch (drawing.kind) {
          case 'owned': {
            // Its controls place themselves in the layer; the native drawing keeps its frame.
            const Owner = drawing.entry.component;
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
          case 'look':
            return framed(look(drawing.entry, drawing.interactive), {
              interactive: drawing.interactive,
              inert: drawing.inert,
            });
          case 'native':
            // Inert when an engaged behavior has no renderer of yours: its
            // plugin owns the input (a link's anchor takes the click), and the
            // annotation keeps its own look.
            return framed(native, { inert: drawing.inert });
        }
      })}
      {/* A text box your renderer draws is edited there (`useRichTextEditor`). */}
      {layerTextBoxesOf(texts, items, renderers, annotationKey).map((text) => (
        <FreeText key={text.id} item={text} page={page} />
      ))}
      <ToolGhostImage page={page} />
      <Chrome page={page} components={components} />
    </div>
  );
}

/**
 * The default file-picker provider: the built-in file dialog (from
 * `@embedpdf/web`), honouring the tool's `accept` filter. This is the adapter
 * fulfilling the plugin's DOM-free port — the dialog lives in the framework
 * layer, never in the plugin.
 */
export const filePickerProvider: FilePickerProvider = pickRequestedFile;

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
    return installFilePickerProvider(anno, provider, () =>
      devWarn(
        'file-picker-provider-twice',
        'useFilePickerProvider() is called from two mounted components for the same document — ' +
          'the later one wins. Call it once, at a document-scoped spot.',
      ),
    );
  }, [anno, provider]);
}

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

// ── Comments (the conversation plane) ────────────────────────────────────────

/**
 * A {@link CommentThread} enriched with its page's live display position —
 * the framework-layer join (`enrichCommentThreads` in `@embedpdf/web`).
 * Identity stays `page` (like every annotation surface); these two fields
 * are presentation, tracking page moves and deletes.
 */
export interface CommentThreadView extends CommentThread {
  /** Current 0-based display index of the thread's page; `-1` when the page
   *  is no longer in the document (one-frame teardown race on delete). */
  pageIndex: number;
  /** The page's `/PageLabels` label when the PDF declares one ("iv", "A-2"),
   *  else the 1-based position as a string — print it verbatim. */
  pageLabel: string;
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
