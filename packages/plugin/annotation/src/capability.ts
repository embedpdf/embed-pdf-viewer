import {
  CONTINUOUS_RENDER_POLICY,
  snapAppearanceScale,
  type DocumentEvent,
  type PluginContext,
} from '@embedpdf/core';
import type { PageRotation } from '@embedpdf/core-geometry';
import {
  buildCommentThreads,
  encodeStableIdKey,
  resolveBinarySource,
  sniffBinaryMetadata,
  type CommentThread,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationPatch,
  type AnnotationRef,
  type AttachmentFileSource,
  type BinarySource,
  type PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import { SelectionToken as SelectionPublicToken } from '@embedpdf/plugin-selection';
import {
  canMove,
  chrome as coreChrome,
  clickCreateGeom,
  contentToPdfRect,
  creationDraftAnchor as coreCreationDraftAnchor,
  cursorAt,
  defaultsFor,
  expandGroups,
  FLAG_KEYS,
  fitStampBox,
  geomVisualBounds,
  groupKeyOf,
  hitTest,
  pageItems as corePageItems,
  pdfToContentRect,
  propsFor,
  readProp,
  resolveClickPlacement,
  selectionAnchor as coreSelectionAnchor,
  sharedProps,
  styleFromProps,
  update,
  isSubstrateOnly,
  linkChildrenOf,
  linkOf,
  uprightRotation,
  viewable,
  type Annot,
  type AnnotationProps,
  type ChromeGeom,
  type ChromeNode,
  type CreationDraftAnchor,
  type Effect,
  type Geom,
  type Id,
  type Model,
  type Msg,
  type PropKey,
  type Rect,
  type RenderItem,
  type Subtype,
  type Vec,
  type ViewEnv,
} from '@embedpdf/core-annotation';
import {
  boxGeomFields,
  fromDTO,
  linkChildRects,
  refKey,
  toCreateDraft,
  toPatch,
  toScopedPatch,
  writableTarget,
} from './repository';
import { buildTextItems } from './text-item';
import { buildToolRegistry, isTouchDirect } from './tools';
import type { AnnotationToolInput, ResolvedTool } from './tools';
import type {
  AnnotationAction,
  AnnotationConfig,
  AnnotationHostCapability,
  AnnotationHydration,
  AnnotationState,
  ArmedStampPreview,
  CommentPermissions,
  CommentsApi,
  ThreadDeleteResult,
  Behavior,
  ChromeSettings,
  SelectionFlags,
  SelectionProps,
  FilePickerProvider,
  FilePromptRequest,
  LinkNavItem,
  StampToolInput,
  TextItem,
} from './types';
import { ICON_PLACE_SIZE, iconPlacementDraft, isIconPlaceKind } from './placement';

/** Fold `zoom`/`rotation` host args into the core's ViewEnv (or none).
 *  `zoom` is the page's RELATIVE zoom (`transform.zoom`) — never the
 *  px-per-point `scale` (that one only converts CSS-px chrome settings). */
const viewEnv = (zoom?: number, rotation?: number): ViewEnv | undefined =>
  zoom != null || rotation != null
    ? { zoom: zoom ?? 1, rotation: (rotation ?? 0) as ViewEnv['rotation'] }
    : undefined;

const TEXT_COMMIT_DEBOUNCE_MS = 250;

/**
 * The annotation shell. The pure `update` runs HERE (so it can emit effects);
 * the resulting model is dispatched to the store, and each effect is performed
 * against the engine repository — optimistic create → reconcile to the durable
 * ref, patch/delete fire-and-forget.
 */
export function createAnnotationCapability(
  ctx: PluginContext<AnnotationState, AnnotationAction>,
  config: AnnotationConfig = {},
): AnnotationHostCapability {
  const behaviors: Behavior[] = [];
  /** Per-annotation debounce timer for the engine `contents` write while typing. */
  const textTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // The resolved tool table (built-ins + config overrides). A tool is a named
  // authoring preset: it maps its id → a routing subtype, a `defaults` key
  // (`preset`), a `propsFor` kind, and — for stamps — a source spec. `configTools`
  // is kept so `registerTool` can re-resolve `extends` against the same base pool.
  const configTools = config.tools ?? [];
  const registry = buildToolRegistry(configTools);
  /** The installed file-picker port (a DOM file dialog, wired by the framework
   *  adapter), or null — every click-then-pick tool resolves through this ONE
   *  slot. See {@link FilePickerProvider}. */
  let filePickerProvider: FilePickerProvider | null = null;

  const model = (): Model => ctx.getState().model;
  const chromeSettings = (): ChromeSettings => ctx.getState().chrome;

  /**
   * Ids on a page whose Behavior is currently ENGAGED (form widgets under a
   * fill tool): they render their own DOM, so hit-test/marquee must not see
   * them. Resolved per event — engagement follows the active tool live.
   */
  const inertIdsAt = (pon: number): ReadonlySet<Id> | undefined => {
    if (!behaviors.length) return undefined;
    const m = model();
    let out: Set<Id> | undefined;
    for (const id of m.order) {
      const a = m.byId[id];
      if (!a || a.pon !== pon) continue;
      if (behaviors.some((b) => b.matches({ subtype: a.subtype, ref: a.ref }) && b.engaged())) {
        (out ??= new Set()).add(id);
      }
    }
    return out;
  };

  /** The CSS-px chrome settings converted to CONTENT units by the page's view
   *  scale (px per content unit) — screen-constant grab zones + stalk at every
   *  zoom. No scale → the values are read as content units (headless callers).
   *  `boost` widens the GRAB tolerances only (never the drawn chrome or the
   *  knob's position) — the touch path passes {@link TOUCH_GRAB_BOOST} so
   *  handles present finger-sized targets. */
  const chromeGeomAt = (scale?: number, boost = 1): ChromeGeom => {
    const cs = chromeSettings();
    const s = scale || 1;
    return {
      handleTol: (cs.handles.hitSize / 2 / s) * boost,
      knobTol: (cs.knob.hitSize / 2 / s) * boost,
      knobOffset: cs.knob.offset / s,
    };
  };
  /** Finger-sized grab zones: 2× the mouse tolerances lands a ~24px handle hit
   *  box in Apple's ~44pt-target territory without moving any visuals. */
  const TOUCH_GRAB_BOOST = 2;
  const grabBoost = (touch?: boolean): number => (touch ? TOUCH_GRAB_BOOST : 1);

  // Memoize the derived per-page arrays by input identity, so a selector returns
  // a STABLE reference between dispatches (useSyncExternalStore needs this — the
  // model object only changes when `update` produces a new one; chrome also keys
  // on the settings object + the page scale it was projected with).
  const itemsCache = new Map<
    number,
    {
      model: Model;
      ghost: AnnotationState['toolGhost'];
      zoom: number | undefined;
      rotation: number | undefined;
      v: RenderItem[];
    }
  >();
  const chromeCache = new Map<
    number,
    {
      model: Model;
      cs: ChromeSettings;
      scale: number | undefined;
      rotation: number | undefined;
      zoom: number | undefined;
      v: ChromeNode[];
    }
  >();
  const memoItems = (pon: number, view?: ViewEnv): RenderItem[] => {
    const m = model();
    const g = ctx.getState().toolGhost;
    const c = itemsCache.get(pon);
    if (
      c &&
      c.model === m &&
      c.ghost === g &&
      c.zoom === view?.zoom &&
      c.rotation === view?.rotation
    )
      return c.v;
    const v = corePageItems(m, pon, view);
    // The armed tool's VECTOR footprint ghost rides the same items pipeline as
    // every draft preview (image ghosts blit through the framework instead).
    if (g && g.pon === pon && g.kind === 'vector') {
      const tool = registry.get(g.toolId);
      const style = styleFromProps(defaultsFor(m, tool?.preset ?? g.toolId));
      v.push({
        id: 'tool-ghost',
        ref: null,
        subtype: tool?.subtype ?? 'square',
        geom: g.geom,
        box: g.box,
        style,
        source: 'ghost',
        selected: false,
      });
    }
    itemsCache.set(pon, { model: m, ghost: g, zoom: view?.zoom, rotation: view?.rotation, v });
    return v;
  };
  const memoChrome = (
    pon: number,
    scale?: number,
    rotation?: number,
    zoom?: number,
  ): ChromeNode[] => {
    const m = model();
    const cs = chromeSettings();
    const c = chromeCache.get(pon);
    if (
      c &&
      c.model === m &&
      c.cs === cs &&
      c.scale === scale &&
      c.rotation === rotation &&
      c.zoom === zoom
    )
      return c.v;
    let v = coreChrome(
      m,
      pon,
      pageBoxOf(pon),
      chromeGeomAt(scale).knobOffset,
      viewEnv(zoom, rotation),
    );
    // `guides.enabled` is presentation config, filtered HERE so the emitted
    // chrome stays authoritative for every painter (default and headless alike).
    if (!cs.guides.enabled) v = v.filter((n) => n.kind !== 'rotate-guides');
    chromeCache.set(pon, { model: m, cs, scale, rotation, zoom, v });
    return v;
  };
  // Anchor for the selection menu — memoized by input identity so the selector
  // returns a stable reference between unrelated dispatches.
  let anchorCache: {
    model: Model;
    cs: ChromeSettings;
    scale: number | undefined;
    rotation: number | undefined;
    zoom: number | undefined;
    v: { pon: number; bounds: Rect; knob?: Vec } | null;
  } | null = null;
  const memoAnchor = (
    scale?: number,
    rotation?: number,
    zoom?: number,
  ): { pon: number; bounds: Rect; knob?: Vec } | null => {
    const m = model();
    const cs = chromeSettings();
    if (
      anchorCache &&
      anchorCache.model === m &&
      anchorCache.cs === cs &&
      anchorCache.scale === scale &&
      anchorCache.rotation === rotation &&
      anchorCache.zoom === zoom
    )
      return anchorCache.v;
    const v = coreSelectionAnchor(
      m,
      pageBoxOf,
      () => chromeGeomAt(scale).knobOffset,
      () => viewEnv(zoom, rotation),
    );
    anchorCache = { model: m, cs, scale, rotation, zoom, v };
    return v;
  };
  let draftAnchorCache: { model: Model; v: CreationDraftAnchor | null } | null = null;
  const memoDraftAnchor = (): CreationDraftAnchor | null => {
    const m = model();
    if (draftAnchorCache && draftAnchorCache.model === m) return draftAnchorCache.v;
    const v = coreCreationDraftAnchor(m);
    draftAnchorCache = { model: m, v };
    return v;
  };
  // The selection's property schema + values — memoized by model identity so a
  // subscribed sidebar re-renders only when the model actually changed.
  let selPropsCache: { model: Model; v: SelectionProps } | null = null;
  const memoSelectionProps = (): SelectionProps => {
    const m = model();
    if (selPropsCache && selPropsCache.model === m) return selPropsCache.v;
    const members = m.selected.map((id) => m.byId[id]).filter((a): a is Annot => !!a);
    const specs = sharedProps(members.map((a) => a.subtype));
    const values: Partial<AnnotationProps> = {};
    const mixed: PropKey[] = [];
    // `link` is the one derived value: parents store nothing — the committed
    // children are the truth, read through the lens (the link KIND still
    // reads its own /A off the annot).
    const valueOf = (a: Annot, key: PropKey): unknown =>
      key === 'link' && a.subtype !== 'link' ? linkOf(m, a.id) : readProp(a, key);
    for (const spec of specs) {
      const first = valueOf(members[0], spec.key);
      (values as Record<PropKey, unknown>)[spec.key] = first;
      const firstJson = JSON.stringify(first);
      if (members.some((a) => JSON.stringify(valueOf(a, spec.key)) !== firstJson))
        mixed.push(spec.key);
    }
    const v: SelectionProps = { specs, values, mixed };
    selPropsCache = { model: m, v };
    return v;
  };
  // The navigation plane's feed: clickable link areas per page — standalone
  // links + attached-link segments (rects derived by the reconciler's own
  // rule). Memoized by model identity for selector use.
  const linkItemsCache = new Map<number, { model: Model; v: LinkNavItem[] }>();
  const memoLinkItems = (pon: number): LinkNavItem[] => {
    const m = model();
    const c = linkItemsCache.get(pon);
    if (c && c.model === m) return c.v;
    const v: LinkNavItem[] = [];
    for (const id of m.order) {
      const a = m.byId[id];
      if (!a || a.pon !== pon || a.subtype !== 'link') continue;
      if (!viewable(a.flags, false)) continue; // hidden links don't navigate
      // Standalone links carry their own model `link` (/A); attached children
      // carry the target on their DTO. Rects are the CHILD's own committed
      // geometry — anchors render only in view contexts, where nothing is
      // mid-gesture, so no live parent-derivation is needed.
      const target =
        a.link ?? (a.data?.subtype === 'link' ? (a.data.target ?? null) : null);
      if (target == null || a.geom.t !== 'rect') continue;
      v.push({ id, rect: a.geom.rect, target, attached: a.group !== undefined });
    }
    linkItemsCache.set(pon, { model: m, v });
    return v;
  };

  const textsCache = new Map<
    number,
    { model: Model; zoom: number | undefined; rotation: number | undefined; v: TextItem[] }
  >();
  const memoTexts = (pon: number, view?: ViewEnv): TextItem[] => {
    const m = model();
    const c = textsCache.get(pon);
    if (c && c.model === m && c.zoom === view?.zoom && c.rotation === view?.rotation) return c.v;
    const v = buildTextItems(m, pon, view);
    textsCache.set(pon, { model: m, zoom: view?.zoom, rotation: view?.rotation, v });
    return v;
  };
  // The selection's `/F` state — per-flag value, `null` where members disagree.
  let selFlagsCache: { model: Model; v: SelectionFlags | null } | null = null;
  const memoSelectionFlags = (): SelectionFlags | null => {
    const m = model();
    if (selFlagsCache && selFlagsCache.model === m) return selFlagsCache.v;
    const members = m.selected.map((id) => m.byId[id]).filter((a): a is Annot => !!a);
    let v: SelectionFlags | null = null;
    if (members.length) {
      v = {} as SelectionFlags;
      for (const key of FLAG_KEYS) {
        const first = members[0].flags[key];
        v[key] = members.every((a) => a.flags[key] === first) ? first : null;
      }
    }
    selFlagsCache = { model: m, v };
    return v;
  };
  const cropOf = (pon: number) =>
    ctx.document()?.pages.find((p) => p.pageObjectNumber === pon)?.boxes.crop ?? null;
  /** The page's box in content space (origin at the crop top-left) — the box
   *  pointer gestures clamp to, so annotations stay page-bound. */
  const pageBoxOf = (pon: number): Rect | undefined => {
    const crop = cropOf(pon);
    return crop
      ? { x: 0, y: 0, width: crop.right - crop.left, height: crop.top - crop.bottom }
      : undefined;
  };

  /**
   * The armed stamp-tool payload: the bytes the next click places, plus the
   * PDF-point placement size (derived from the sniffed intrinsic aspect).
   * Transient tool state — deliberately NOT in the model: it is never
   * rendered, never synced, and dies with the tool.
   */
  // The DESIRED placement size (PDF points, pre page-clamp): the image's own
  // intrinsic size unless the caller overrides it. Clamping to the page happens
  // at placement, since it depends on which page (and rotation) receives it.
  // `preview` is the browser-paintable render for the hover ghost — transient
  // tool state like the bytes themselves, so it lives here, not in the store.
  let armedStamp: {
    source: BinarySource;
    width: number;
    height: number;
    preview: ArmedStampPreview | null;
  } | null = null;

  /**
   * The desired stamp size (PDF points) from sniffed bytes: the image's
   * INTRINSIC pixel dimensions taken 1:1 as points (the v2 rule — keep the
   * artwork's own size, then clamp to the page at placement). A `targetWidth`
   * override scales to that width, aspect preserved. Vector (PDF) stamps carry
   * no sniffable dimensions — a caller-supplied `intrinsic` override (a stamp
   * library knows its page size) keeps the true aspect; without one they fall
   * back to a square target.
   */
  const desiredStampSize = (
    meta: NonNullable<ReturnType<typeof sniffBinaryMetadata>>,
    targetWidth?: number,
    intrinsicOverride?: { width: number; height: number },
  ): { width: number; height: number } => {
    const intrinsic =
      intrinsicOverride && intrinsicOverride.width > 0 && intrinsicOverride.height > 0
        ? intrinsicOverride
        : 'width' in meta && meta.width > 0
          ? { width: meta.width, height: meta.height }
          : { width: targetWidth ?? 150, height: targetWidth ?? 150 };
    if (targetWidth === undefined) return intrinsic;
    return { width: targetWidth, height: targetWidth * (intrinsic.height / intrinsic.width) };
  };

  const armStamp = async (input: StampToolInput): Promise<void> => {
    // Resolve + sniff up front: a bad payload fails HERE (at the button),
    // not at the click. The original `source` is kept for the create call —
    // normalization inside the engine handles it again from scratch.
    const resolved = await resolveBinarySource(input.source);
    const meta = sniffBinaryMetadata(resolved.bytes);
    if (!meta) {
      throw new Error('[annotation] stamp source must be PNG, JPEG, or single-page PDF bytes');
    }
    // Ghost preview: an explicit `preview` wins (the only way for PDF sources —
    // browsers can't paint those); raster sources default to their own bytes.
    let preview: ArmedStampPreview | null = null;
    if (input.preview) {
      const p = await resolveBinarySource(input.preview);
      preview = { bytes: new Uint8Array(p.bytes), mimeType: p.mimeType };
    } else if (meta.mimeType !== 'application/pdf') {
      preview = { bytes: new Uint8Array(resolved.bytes), mimeType: meta.mimeType };
    }
    armedStamp = {
      source: input.source,
      ...desiredStampSize(meta, input.targetWidth, input.intrinsicSize),
      preview,
    };
    ctx.dispatch({ type: 'STAMP_ARM_CHANGED' });
    ctx.tryGet(InteractionToken)?.activateTool('stamp');
  };

  const disarmStamp = (): void => {
    if (!armedStamp) return;
    armedStamp = null;
    ctx.dispatch({ type: 'STAMP_ARM_CHANGED' });
  };

  /** Move the hover FOOTPRINT ghost to a content point. The box/geometry is
   *  computed by the SAME rules the click's placement uses ({@link createStampAt}
   *  fit + clamp for an armed stamp; the click-create anchor + page clamp for a
   *  draw tool), so the ghost is the placement, not an approximation of it. */
  const ghostHoverAt = (
    toolId: string,
    pon: number,
    point: Vec,
    displayRotation?: number,
  ): void => {
    const tool = registry.get(toolId);
    const crop = cropOf(pon);
    if (!tool || tool.ghost === false || !crop) {
      clearGhost();
      return;
    }
    const page = { width: crop.right - crop.left, height: crop.top - crop.bottom };
    // The armed stamp: the fitted image box (the framework blits the preview).
    if (armedStamp) {
      const rot = uprightRotFor(displayRotation);
      const box = fitStampBox(
        point,
        { width: armedStamp.width, height: armedStamp.height },
        page,
        rot,
      );
      ctx.dispatch({ type: 'SET_TOOL_GHOST', ghost: { pon, box, rot, kind: 'image' } });
      return;
    }
    // Icon kinds: the fixed 20×20 footprint under the cursor — the SAME box
    // the click's placement uses (fit + clamp), painted as a vector ghost.
    if (isIconPlaceKind(tool.subtype)) {
      const rot = uprightRotFor(displayRotation);
      const box = fitStampBox(point, ICON_PLACE_SIZE, page, rot);
      dispatchVectorGhost(pon, toolId, { t: 'rect', rect: box, ellipse: false });
      return;
    }
    // A click-create tool: the SHARED placement layer resolves where the click
    // would land (same call the core's commit makes — preview ≡ commit by
    // construction), and the annotation-only conversion paints it as a vector
    // ghost through pageItems. No kind knowledge lives in this shell.
    if (!tool.clickCreate) {
      clearGhost();
      return;
    }
    const placement = resolveClickPlacement(point, tool.clickCreate, {
      pageBox: { x: 0, y: 0, width: page.width, height: page.height },
      upright: tool.upright,
      displayRotation: displayRotation as PageRotation | undefined,
    });
    const geom = clickCreateGeom(tool.subtype, placement, defaultsFor(model(), tool.preset));
    if (!geom) {
      clearGhost();
      return;
    }
    dispatchVectorGhost(pon, toolId, geom);
  };

  /** Paint a vector ghost item for a tool's would-be geometry — shared by the
   *  hover footprint and the externally-driven placement preview. */
  const dispatchVectorGhost = (pon: number, toolId: string, geom: Geom): void => {
    const tool = registry.get(toolId);
    const style = styleFromProps(defaultsFor(model(), tool?.preset ?? toolId));
    ctx.dispatch({
      type: 'SET_TOOL_GHOST',
      ghost: {
        pon,
        box: geomVisualBounds(geom, style.strokeWidth, style.border),
        rot: 0,
        kind: 'vector',
        toolId,
        geom,
      },
    });
  };

  /**
   * Drive the placement preview during an EXTERNALLY-owned creation gesture
   * (the form plugin's drag-to-place): paint the box the commit would use,
   * styled from the TOOL's defaults, through the same ghost pipeline as every
   * footprint. The box is clamped to the page (a drag may overshoot).
   */
  const setPlacementPreview = (toolId: string, pon: number, box: Rect): void => {
    const crop = cropOf(pon);
    if (!crop) return;
    const page = { width: crop.right - crop.left, height: crop.top - crop.bottom };
    const x = Math.max(0, Math.min(box.x, page.width));
    const y = Math.max(0, Math.min(box.y, page.height));
    const rect: Rect = {
      x,
      y,
      width: Math.max(0, Math.min(box.x + box.width, page.width) - x),
      height: Math.max(0, Math.min(box.y + box.height, page.height) - y),
    };
    dispatchVectorGhost(pon, toolId, { t: 'rect', rect, ellipse: false });
  };

  const clearGhost = (): void => {
    if (ctx.getState().toolGhost) ctx.dispatch({ type: 'SET_TOOL_GHOST', ghost: null });
  };

  /** Place a stamp of `desired` PDF-point size centred on a content point — the
   *  one engine-write both the armed and click-to-place paths funnel through.
   *  The size is fit to the page and clamped fully onto it (v2 rubber-stamp
   *  rule: never larger than the page, aspect preserved), and never spills off
   *  the edge. `rotCW` (the tool's upright counter-rotation, CW content degrees)
   *  emits the repository's box rotation fields — the engine bakes the tilted
   *  /AP exactly as an interactively rotated stamp round-trips, and the fit uses
   *  the ROTATED footprint. Returns false when the page/document isn't ready. */
  const createStampAt = (
    pon: number,
    point: Vec,
    source: BinarySource,
    desired: { width: number; height: number },
    rotCW = 0,
  ): boolean => {
    const doc = ctx.doc;
    const crop = cropOf(pon);
    if (!doc || !crop) return false;
    const page = { width: crop.right - crop.left, height: crop.top - crop.bottom };
    const box: Rect = fitStampBox(point, desired, page, rotCW);
    doc
      .page(pon)
      .annotations.create({
        subtype: 'stamp',
        ...boxGeomFields(box, rotCW, crop),
        source,
        fit: 'contain',
      })
      .then(
        // A stamp has no vector render — the engine-baked /AP IS the visual.
        // Every placement selects its result (the anchor for menus/editing).
        (res) => {
          syncDTO(res.created, 'baked');
          apply({ t: 'select', ids: [refKey(res.created.ref)] });
        },
        (err) => console.error('[annotation] stamp placement failed:', err),
      );
    return true;
  };

  /** The active tool's upright counter-rotation for a click at `displayRotation`
   *  (0 when the tool doesn't ask for upright, or the display isn't rotated). */
  const uprightRotFor = (displayRotation?: number): number => {
    if (!displayRotation) return 0;
    const ix = ctx.tryGet(InteractionToken);
    const tool = ix ? registry.get(ix.activeToolId()) : undefined;
    return tool?.upright ? uprightRotation(displayRotation) : 0;
  };

  const placeArmedStamp = (pon: number, point: Vec, displayRotation?: number): boolean => {
    const armed = armedStamp;
    if (!armed) return false;
    return createStampAt(
      pon,
      point,
      armed.source,
      { width: armed.width, height: armed.height },
      uprightRotFor(displayRotation),
    );
  };

  /** Sniff a stamp source (rejecting non-image bytes) and place it at its
   *  intrinsic size (fit to the page in {@link createStampAt}); `targetWidth`
   *  overrides the width, aspect preserved. */
  const placeStampSource = async (
    pon: number,
    point: Vec,
    source: BinarySource,
    rotCW: number,
    targetWidth?: number,
  ): Promise<void> => {
    const resolved = await resolveBinarySource(source);
    const meta = sniffBinaryMetadata(resolved.bytes);
    if (!meta) {
      console.error('[annotation] stamp source must be PNG, JPEG, or single-page PDF bytes');
      return;
    }
    createStampAt(pon, point, source, desiredStampSize(meta, targetWidth), rotCW);
  };

  /**
   * Click-to-place: resolve the ACTIVE tool's source spec. Fixed `bytes` place
   * immediately; a `'prompt'` source asks the installed provider, then places on
   * resolve — dropping the placement if it was cancelled, or if the tool or
   * document changed while the picker was open (the intent expired).
   */
  const requestStampAt = (pon: number, point: Vec, displayRotation?: number): boolean => {
    const ix = ctx.tryGet(InteractionToken);
    const tool = ix ? registry.get(ix.activeToolId()) : undefined;
    const spec = tool?.source;
    if (!spec) return false;
    // Resolved AT the click (like the placement point): the upright intent
    // belongs to the moment the author picked the spot, even when a 'prompt'
    // source resolves the bytes later.
    const rotCW = tool.upright && displayRotation ? uprightRotation(displayRotation) : 0;
    if (spec.kind === 'bytes') {
      void placeStampSource(pon, point, spec.source, rotCW);
      return true;
    }
    // kind === 'prompt' — needs the environment: the ONE file-picker port.
    return promptFileAt(
      tool,
      pon,
      point,
      (picked) => void placeStampSource(pon, point, picked.data, rotCW),
    );
  };

  /**
   * Run the installed file-picker port for a click-then-pick tool, with the
   * shared expiry rule: the placement is dropped if the picker cancels, or if
   * the document or the active tool changed while it was open (the intent
   * expired with the click). No provider installed → decline the click (let a
   * lower-priority handler act) rather than swallow it.
   */
  const promptFileAt = (
    tool: ResolvedTool,
    pon: number,
    point: Vec,
    place: (picked: AttachmentFileSource) => void,
  ): boolean => {
    const provider = filePickerProvider;
    if (!provider) return false;
    const spec = tool.source;
    const req: FilePromptRequest = {
      toolId: tool.id,
      subtype: tool.subtype,
      accept: spec?.kind === 'prompt' ? spec.accept : undefined,
      pon,
      point,
    };
    const docAtClick = ctx.doc;
    provider(req).then(
      (picked) => {
        if (!picked) return; // cancelled
        if (ctx.doc !== docAtClick) return; // document changed underneath
        if (ctx.tryGet(InteractionToken)?.activeToolId() !== tool.id) return; // tool changed
        place(picked);
      },
      (err) => console.error('[annotation] file-picker provider failed:', err),
    );
    return true;
  };

  /** Place a fixed-size ICON annotation (note / file attachment) centred on a
   *  content point — the icon-kind sibling of {@link createStampAt}. The
   *  engine bakes the 20×20 /AP from /C + /Name; a successful create selects
   *  the new annotation (the anchor for its menu / future comment popup). */
  const createIconAt = (
    tool: ResolvedTool,
    pon: number,
    point: Vec,
    rotCW: number,
    file: AttachmentFileSource | null,
  ): boolean => {
    const doc = ctx.doc;
    const crop = cropOf(pon);
    if (!doc || !crop || !isIconPlaceKind(tool.subtype)) return false;
    const page = { width: crop.right - crop.left, height: crop.top - crop.bottom };
    const box: Rect = fitStampBox(point, ICON_PLACE_SIZE, page, rotCW);
    const draft = iconPlacementDraft(
      tool.subtype,
      boxGeomFields(box, rotCW, crop),
      defaultsFor(model(), tool.preset),
      tool.flags,
      file,
    );
    doc
      .page(pon)
      .annotations.create(draft)
      .then(
        (res) => {
          syncDTO(res.created, 'baked');
          apply({ t: 'select', ids: [refKey(res.created.ref)] });
        },
        (err) => console.error('[annotation] icon placement failed:', err),
      );
    return true;
  };

  /**
   * The ONE click-to-place entry the place handler forwards every down to —
   * armed payload first, then the active tool's kind decides:
   *   - stamp        → the source spec (fixed bytes, or the file-picker port)
   *   - note (text)  → place immediately (no payload)
   *   - attachment   → spot first, file second: the file-picker port opens
   *                    inside the click gesture, and placement lands when it
   *                    resolves (dropped on cancel, or if the tool/document
   *                    changed while the picker was open).
   * Returns whether the click was consumed.
   */
  const placeAt = (pon: number, point: Vec, displayRotation?: number): boolean => {
    if (placeArmedStamp(pon, point, displayRotation)) return true;
    const ix = ctx.tryGet(InteractionToken);
    const tool = ix ? registry.get(ix.activeToolId()) : undefined;
    if (!tool) return false;
    if (tool.subtype === 'stamp') return requestStampAt(pon, point, displayRotation);
    if (!isIconPlaceKind(tool.subtype)) return false;
    const rotCW = tool.upright && displayRotation ? uprightRotation(displayRotation) : 0;
    if (tool.subtype === 'text') return createIconAt(tool, pon, point, rotCW, null);
    return promptFileAt(tool, pon, point, (picked) =>
      createIconAt(tool, pon, point, rotCW, picked),
    );
  };

  /** The page a ref lives on: from the loaded model first (covers obj/nm refs
   *  that don't carry a pon), else the ref itself (index refs do). */
  const ponForRef = (ref: AnnotationRef): number | null =>
    model().byId[refKey(ref)]?.pon ?? (ref.kind === 'index' ? ref.pageObjectNumber : null);

  /**
   * Re-sync one annotation into the model from the authoritative engine DTO,
   * with the render `source` the caller decides: `'vector'` when WE authored or
   * changed the appearance (create / restyle / resize), `'baked'` when the AP is
   * still authoritative (a move, which preserves it, or a remote edit).
   * `bumpAp` marks the upsert as confirming an engine /AP re-bake with new
   * content, so the annotation's `apVersion` — and with it the page's
   * appearance epoch — advances and the shell fetches the fresh raster.
   */
  const syncDTO = (
    dto: Parameters<typeof fromDTO>[0],
    source: 'baked' | 'vector',
    bumpAp = false,
  ): void => {
    const crop = cropOf(dto.pageObjectNumber);
    if (crop) apply({ t: 'upsert', annots: [fromDTO(dto, crop, source)], bumpAp });
  };

  /** The one engine-update path, shared by `update` and `updateSelection`. A
   *  programmatic patch changes the appearance → render live (vector). */
  const updateOne = async (ref: AnnotationRef, patch: AnnotationPatch): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('[annotation] no document bound');
    const pon = ponForRef(ref);
    if (pon == null) throw new Error('[annotation] cannot resolve page for ref');
    const res = await doc.page(pon).annotations.update(ref, patch);
    syncDTO(res.updated, 'vector');
  };

  function apply(msg: Msg): void {
    const [next, effects] = update(model(), msg);
    ctx.dispatch({ type: 'SET_MODEL', model: next });
    for (const fx of effects) perform(fx, next);
  }

  // ── whole-document hydration ──────────────────────────────────────────
  // The plugin ALWAYS hydrates every page via `listRawAll()` — one bulk
  // request on cloud, one raw worker job locally. A comments sidebar needs
  // every page, and per-page lazy loading could never truthfully claim
  // completeness. Coherence protocol: the snapshot arrives cursor-stamped
  // (`auditHead`); remote annotation events arriving DURING the hydration
  // window queue here and replay by cursor after ingest — events with
  // `serverId <= auditHead` are already inside the snapshot and drop,
  // newer ones apply on top. This makes the delete-during-hydrate
  // resurrection structurally impossible. `stream.desynced` re-runs the
  // same ingest with `bumpAp` (rasters may have changed invisibly inside
  // the gap).
  let hydrationStarted = false;
  let hydrationWindow = false;
  let hydrationRunning: Promise<void> | null = null;
  let hydrateAgain = false;
  const pendingRemote: DocumentEvent[] = [];

  const setHydration = (hydration: AnnotationHydration): void =>
    ctx.dispatch({ type: 'SET_HYDRATION', hydration });

  const ingestSnapshot = (
    snap: Awaited<ReturnType<NonNullable<typeof ctx.doc>['annotations']['listRawAll']>>,
    bumpAp: boolean,
  ): void => {
    const annots: Annot[] = [];
    for (const page of snap.pages) {
      const crop = cropOf(page.pageState.pageObjectNumber);
      if (!crop) continue;
      // Children (replies, states, attached links) enter the substrate as
      // first-class annots; the planes derive (paint cull + lenses).
      annots.push(...page.annotations.map((d) => fromDTO(d, crop)));
    }
    apply({ t: 'hydrated', annots, bumpAp });
  };

  const runHydration = (bumpAp: boolean): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return Promise.resolve();
    hydrationWindow = true;
    setHydration({ status: 'loading' });
    const run = doc.annotations
      .listRawAll()
      .then((snap) => {
        ingestSnapshot(snap, bumpAp);
        const head = snap.auditHead;
        const queued = pendingRemote.splice(0);
        hydrationWindow = false;
        for (const event of queued) {
          const serverId = 'origin' in event ? event.origin.serverId : null;
          // ≤ auditHead ⇒ already inside the snapshot; drop. Absent head =
          // a local engine, which has no remote events anyway.
          if (head !== undefined && serverId !== null && serverId <= head) continue;
          applyRemoteAnnotationEvent(event);
        }
        setHydration({ status: 'complete' });
      })
      .catch((error: unknown) => {
        // Degrade to live-only: queued and future events apply directly so
        // the view stays as correct as it can be until a rehydrate lands.
        hydrationWindow = false;
        for (const event of pendingRemote.splice(0)) applyRemoteAnnotationEvent(event);
        setHydration({ status: 'error', error });
      })
      .finally(() => {
        hydrationRunning = null;
        if (hydrateAgain) {
          hydrateAgain = false;
          hydrationRunning = runHydration(true);
        }
      });
    hydrationRunning = run;
    return run;
  };

  const rehydrate = (): Promise<void> => {
    if (hydrationRunning) {
      // A desync during an in-flight hydration: that snapshot may already
      // be stale — run once more after it settles.
      hydrateAgain = true;
      return hydrationRunning;
    }
    hydrationRunning = runHydration(true);
    return hydrationRunning;
  };

  /**
   * Fold one REMOTE annotation event into the model (transplanted from the
   * effects layer so hydration can queue + replay through the same code
   * path). `bump` re-fetches rasters, `keep` doesn't — driven by the
   * ENGINE'S appearance echo riding the event, so a remote MOVE costs
   * peers zero re-renders while a remote restyle refreshes exactly once.
   */
  const upsertRemote = (
    dtos: ReadonlyArray<Parameters<typeof fromDTO>[0]>,
    bumpAp: boolean,
  ): void => {
    const bump: Annot[] = [];
    const keep: Annot[] = [];
    for (const dto of dtos) {
      const crop = cropOf(dto.pageObjectNumber);
      if (!crop) continue;
      // Another session authored this — trust the engine's baked AP.
      const a = fromDTO(dto, crop, 'baked');
      // Substrate-only annotations (replies, review states, attached link
      // children) never paint, so their arrival must not trigger a raster
      // fetch or epoch churn. A remote link child is just an upsert — the
      // `linkOf` lens re-derives the parent's value on the next read.
      (bumpAp && !isSubstrateOnly(a) ? bump : keep).push(a);
    }
    if (bump.length) apply({ t: 'upsert', annots: bump, bumpAp: true });
    if (keep.length) apply({ t: 'upsert', annots: keep });
  };

  const applyRemoteAnnotationEvent = (event: DocumentEvent): void => {
    switch (event.type) {
      case 'annotation.created':
        // A create ships with a freshly baked /AP — fetch it.
        upsertRemote([event.created], true);
        break;
      case 'annotation.updated':
        // The engine's verdict rides the event: preserved moves keep the
        // cached raster, regenerated appearances re-fetch exactly once.
        upsertRemote([event.updated], event.appearance.changed);
        break;
      case 'annotation.moved':
        // A z-order move never touches /AP.
        upsertRemote(event.moved, false);
        break;
      case 'annotation.deleted':
        if (event.deleted) {
          const key = encodeStableIdKey(event.deleted);
          // Attached link children are model annotations, so a remote child
          // delete is this same plain remove — the `linkOf` lens re-derives.
          if (model().byId[key]) apply({ t: 'remove', ids: [key] });
        }
        break;
      default:
        break;
    }
  };

  // ── the comments lens (the conversation plane's surface) ──────────────
  // A derived, memoized threads index over the substrate. Because every
  // path — optimistic writes, engine confirms, remote events, hydration —
  // lands in the model, the sidebar updates with zero extra wiring. The
  // memo keys on the model's annotation content (byId/order — hover and
  // drafts don't invalidate) PLUS the layout (display order is computed
  // fresh against the live pages) and the session identity.

  const currentUserId = (): string | undefined => ctx.doc?.security.identity?.user_id;

  interface ThreadsIndex {
    threads: CommentThread[];
    byMember: Map<Id, CommentThread>;
  }
  let threadsMemo:
    | (ThreadsIndex & {
        byId: Model['byId'];
        order: Model['order'];
        layout: string;
        userId: string | undefined;
      })
    | null = null;

  /** Value-stable layout key: display order is all the sort consumes, so
   *  the memo must survive hosts that rebuild the pages array per read. */
  const layoutSignature = (): string =>
    (ctx.document()?.pages ?? []).map((p) => p.pageObjectNumber).join(',');

  const computeThreadsIndex = (): ThreadsIndex => {
    const m = model();
    // Committed truth only: optimistic tmp drafts have no DTO yet and join
    // the index when their create confirms.
    const dtos: AnnotationDTO[] = [];
    for (const id of m.order) {
      const data = m.byId[id]?.data;
      if (data) dtos.push(data);
    }
    const threads = buildCommentThreads(dtos, { currentUserId: currentUserId() });

    // Display order: page position first (live layout), then top of page
    // (PDF user space is y-up — larger `top` sits higher), then creation.
    const pages = ctx.document()?.pages ?? [];
    const displayIndex = new Map(pages.map((p, i) => [p.pageObjectNumber, i]));
    threads.sort((a, b) => {
      const pa = displayIndex.get(a.pageObjectNumber) ?? Number.MAX_SAFE_INTEGER;
      const pb = displayIndex.get(b.pageObjectNumber) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      if (a.root.rect.top !== b.root.rect.top) return b.root.rect.top - a.root.rect.top;
      const ca = a.root.created ?? '';
      const cb = b.root.created ?? '';
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    });

    const byMember = new Map<Id, CommentThread>();
    for (const t of threads) {
      byMember.set(refKey(t.root.ref), t);
      for (const r of t.replies) byMember.set(refKey(r.ref), t);
      for (const g of t.groupedParts) byMember.set(refKey(g.ref), t);
      for (const s of t.review.statusRefs) byMember.set(refKey(s), t);
    }
    return { threads, byMember };
  };

  const threadsIndex = (): ThreadsIndex => {
    const m = model();
    const layout = layoutSignature();
    const userId = currentUserId();
    if (
      threadsMemo &&
      threadsMemo.byId === m.byId &&
      threadsMemo.order === m.order &&
      threadsMemo.layout === layout &&
      threadsMemo.userId === userId
    ) {
      return threadsMemo;
    }
    threadsMemo = { ...computeThreadsIndex(), byId: m.byId, order: m.order, layout, userId };
    return threadsMemo;
  };

  const threadOf = (ref: AnnotationRef): CommentThread => {
    const t = threadsIndex().byMember.get(refKey(ref));
    if (!t) throw new Error('[annotation] no comment thread contains this ref');
    return t;
  };

  /** Engine create + model sync for conversation-plane annotations (they
   *  never paint, so the render source is immaterial — 'baked' avoids any
   *  vector-scene work). */
  const createConversationAnnot = async (
    pon: number,
    draft: AnnotationDraft,
  ): Promise<AnnotationDTO> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('[annotation] no document bound');
    const res = await doc.page(pon).annotations.create(draft);
    syncDTO(res.created, 'baked');
    return res.created;
  };

  const deleteOne = async (ref: AnnotationRef): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('[annotation] no document bound');
    await doc.page(ref.pageObjectNumber).annotations.delete(ref);
    apply({ t: 'remove', ids: [refKey(ref)] });
  };

  // Screen-anchored like a sticky note; `print` for Acrobat parity.
  const REPLY_FLAGS = { print: true, noZoom: true, noRotate: true };
  // Status annotations are metadata: hidden everywhere (our paint plane
  // culls them regardless; `hidden` keeps foreign viewers from drawing an
  // icon). Phase 0 golden fixtures may refine this convention.
  const STATUS_FLAGS = { hidden: true, noZoom: true, noRotate: true };

  /** Coarse authority mirror (doc.annotate.modify) — B3 replaces this with
   *  the collab-scope mirrors; the FLAG split is already the real rule. */
  // ── authorization: the engine's own collab resolver, mirrored ──
  // `allowsAnnotationMutation` asks about the TARGET's stamped owner,
  // built from the record's EMBD metadata. An unstamped record yields
  // `{}`, which any narrowed grant denies — matching the engine, so a
  // control gated here never disagrees with the write's outcome.
  const mutationTarget = (ref: AnnotationRef): { userId?: string; groupId?: string } => {
    const d = model().byId[refKey(ref)]?.data;
    return {
      ...(d?.userId !== undefined ? { userId: d.userId } : {}),
      ...(d?.groupId !== undefined ? { groupId: d.groupId } : {}),
    };
  };
  const allowsCreate = (): boolean => ctx.doc?.security.allowsAnnotationCreate() ?? false;
  const allowsMutation = (action: 'update' | 'delete', ref: AnnotationRef): boolean =>
    ctx.doc?.security.allowsAnnotationMutation(action, mutationTarget(ref)) ?? false;
  const deletableOne = (ref: AnnotationRef): boolean =>
    allowsMutation('delete', ref) && !(model().byId[refKey(ref)]?.flags.locked ?? false);
  const threadMemberRefs = (t: CommentThread): AnnotationRef[] => [
    ...t.replies.map((r) => r.ref),
    ...t.groupedParts.map((g) => g.ref),
    ...t.review.statusRefs,
    t.root.ref, // root LAST — children first keeps foreign readers coherent
  ];

  const comments: CommentsApi = {
    threads: () => threadsIndex().threads,
    thread: (ref) => threadsIndex().byMember.get(refKey(ref)) ?? null,
    hydration: () => ctx.getState().hydration,
    rehydrate,

    reply: async (ref, text) => {
      const t = threadOf(ref);
      const created = await createConversationAnnot(t.pageObjectNumber, {
        subtype: 'text',
        rect: t.root.rect,
        icon: 'comment',
        contents: text,
        inReplyTo: t.root.ref,
        flags: { ...REPLY_FLAGS },
      } as AnnotationDraft);
      return created.ref;
    },

    edit: async (ref, text) => {
      const subtype = model().byId[refKey(ref)]?.data?.subtype;
      if (!subtype) throw new Error('[annotation] cannot edit an uncommitted annotation');
      await updateOne(ref, { subtype, contents: text } as AnnotationPatch);
    },

    setStatus: async (ref, state) => {
      const t = threadOf(ref);
      const userId = currentUserId();
      // ISO chain: reply to the caller's previous state annotation when one
      // exists, else to the root. Readers everywhere (ours included) accept
      // both shapes.
      const previous = userId ? t.review.byReviewer[userId] : undefined;
      await createConversationAnnot(t.pageObjectNumber, {
        subtype: 'text',
        rect: t.root.rect,
        inReplyTo: previous?.ref ?? t.root.ref,
        state,
        stateModel: 'review',
        flags: { ...STATUS_FLAGS },
      } as AnnotationDraft);
    },

    setMarked: async (ref, marked) => {
      const t = threadOf(ref);
      await createConversationAnnot(t.pageObjectNumber, {
        subtype: 'text',
        rect: t.root.rect,
        inReplyTo: t.root.ref,
        state: marked ? 'marked' : 'unmarked',
        stateModel: 'marked',
        flags: { ...STATUS_FLAGS },
      } as AnnotationDraft);
    },

    remove: deleteOne,

    removeThread: async (ref): Promise<ThreadDeleteResult> => {
      const t = threadOf(ref);
      const members = threadMemberRefs(t);
      // Preflight: all-or-nothing. A blocked member means NOTHING deletes —
      // a half-deleted thread orphans replies in every other viewer.
      const blocked = members.filter((r) => !deletableOne(r));
      if (blocked.length > 0) {
        return {
          deleted: [],
          failed: blocked.map((r) => ({ ref: r, error: new Error('delete not permitted') })),
        };
      }
      const deleted: AnnotationRef[] = [];
      const failed: ThreadDeleteResult['failed'] = [];
      for (const member of members) {
        // A child failure (a race: someone else acted first) stops the
        // cascade before the root, so nothing orphans.
        if (failed.length > 0) break;
        try {
          await deleteOne(member);
          deleted.push(member);
        } catch (error) {
          failed.push({ ref: member, error });
        }
      }
      return { deleted, failed };
    },

    permissionsFor: (ref): CommentPermissions => {
      const flags = model().byId[refKey(ref)]?.flags;
      const t = threadsIndex().byMember.get(refKey(ref)) ?? null;
      return {
        // Replying and setting status CREATE new annotations — gated on
        // the caller's own identity, not the target's owner.
        canReply: allowsCreate(),
        canSetStatus: allowsCreate(),
        canEditText: allowsMutation('update', ref) && !(flags?.lockedContents ?? false),
        canDelete: deletableOne(ref),
        canDeleteThread: t !== null && threadMemberRefs(t).every(deletableOne),
      };
    },
  };

  /**
   * Per-parent serialization of attached-link reconciles: rapid edits chain
   * instead of interleaving (two overlapping runs could double-create
   * children). Each run reads the CURRENT model at execution time, so a
   * chained run converges on the latest desired state.
   */
  const linkSyncChains = new Map<Id, Promise<void>>();
  /**
   * Queue a reconcile. `intent` is either an explicit target (a set/clear —
   * captured by THIS run's closure, so chained sets stay latest-wins) or
   * `'keep'` (a geometry follow: re-rect the children toward whatever target
   * the substrate holds AT RUN TIME — so a remote retarget is never undone
   * by a local move). Returns the chain, so `links.set()` can await commit.
   */
  const scheduleLinkSync = (id: Id, intent: { target: PdfLinkTarget | null } | 'keep'): Promise<void> => {
    const prev = linkSyncChains.get(id) ?? Promise.resolve();
    const next = prev.then(() =>
      reconcileLinkChildren(id, intent === 'keep' ? linkOf(model(), id) : intent.target),
    );
    linkSyncChains.set(id, next);
    void next.finally(() => {
      if (linkSyncChains.get(id) === next) linkSyncChains.delete(id);
    });
    return next;
  };

  /**
   * THE one place attached link children are created, retargeted, re-rected,
   * or deleted. Declarative: desired state = `desired` target + the parent's
   * committed geometry (`linkChildRects`); CURRENT state is read straight
   * from the substrate (`linkChildrenOf`) — no join-key ledger. Results land
   * as ordinary substrate upserts/removes, so the `linkOf` lens converges
   * immediately locally and via events everywhere else. Idempotent — foreign
   * inconsistencies heal on the next local edit.
   */
  const reconcileLinkChildren = async (id: Id, desired: PdfLinkTarget | null): Promise<void> => {
    const doc = ctx.doc;
    const a = model().byId[id];
    if (!doc || !a || !a.ref || a.subtype === 'link') return;
    const crop = cropOf(a.pon);
    if (!crop) return;
    const page = doc.page(a.pon);
    // Read-only target arms can't be (re)written: children keep their /A and
    // only their rects follow the parent.
    const target = writableTarget(desired);
    const rects = desired == null ? [] : linkChildRects(a).map((r) => contentToPdfRect(r, crop));
    const current = linkChildrenOf(model(), id);
    try {
      const paired = Math.min(current.length, rects.length);
      for (let i = 0; i < paired; i++) {
        const ref = current[i].ref;
        if (!ref) continue;
        const res = await page.annotations.update(ref, {
          subtype: 'link',
          rect: rects[i],
          ...(target ? { target } : {}),
        });
        apply({ t: 'upsert', annots: [fromDTO(res.updated, crop, 'baked')] });
      }
      for (let i = current.length; i < rects.length; i++) {
        const res = await page.annotations.create({
          subtype: 'link',
          rect: rects[i],
          target,
          inReplyTo: a.ref,
          replyType: 'group',
        });
        apply({ t: 'upsert', annots: [fromDTO(res.created, crop, 'baked')] });
      }
      for (let i = rects.length; i < current.length; i++) {
        const child = current[i];
        if (child.ref) await page.annotations.delete(child.ref);
        apply({ t: 'remove', ids: [child.id] });
      }
    } catch (err) {
      console.error('[annotation] attached-link sync failed:', err);
    }
  };

  /** A relationship-only engine patch (sets/clears `/IRT` + `/RT`) — geometry and
   *  style are left untouched, so grouping never re-bakes an appearance. */
  const relationshipPatch = (
    subtype: AnnotationDTO['subtype'],
    rel: { inReplyTo: AnnotationRef | null; replyType?: 'group' },
  ): AnnotationPatch => ({ subtype, ...rel }) as AnnotationPatch;

  /** Write a relationship change to one committed annotation and re-sync it from
   *  the authoritative DTO (preserving its render source — relationships don't
   *  change the appearance). */
  const writeRelationship = async (
    a: Annot,
    rel: { inReplyTo: AnnotationRef | null; replyType?: 'group' },
  ): Promise<void> => {
    const doc = ctx.doc;
    if (!doc || !a.ref || !a.data) return;
    const res = await doc
      .page(a.pon)
      .annotations.update(a.ref, relationshipPatch(a.data.subtype, rel));
    syncDTO(res.updated, a.source);
  };

  /** Committed, data-backed annotations in the current selection. */
  const selectedCommitted = (): Annot[] => {
    const m = model();
    return m.selected.map((id) => m.byId[id]).filter((a): a is Annot => !!a && !!a.ref && !!a.data);
  };

  function perform(fx: Effect, m: Model): void {
    const doc = ctx.doc;
    if (!doc) return;
    if (fx.fx === 'createGroup') {
      const ids = [fx.primary, ...fx.members];
      const annots = ids.map((id) => m.byId[id]);
      const primary = annots[0];
      if (!primary || annots.some((a) => !a || a.pon !== primary.pon)) {
        apply({ t: 'remove', ids });
        return;
      }
      const crop = cropOf(primary.pon);
      const drafts = crop
        ? annots.map((a) => (a ? toCreateDraft(a, crop) : null))
        : annots.map(() => null);
      if (drafts.some((d) => !d)) {
        apply({ t: 'remove', ids });
        return;
      }

      void (async () => {
        const committed: Array<{ tempId: string; ref: AnnotationRef }> = [];
        try {
          const page = doc.page(primary.pon);
          const primaryResult = await page.annotations.create(drafts[0]!);
          committed.push({ tempId: fx.primary, ref: primaryResult.created.ref });
          apply({
            t: 'created',
            tempId: fx.primary,
            id: refKey(primaryResult.created.ref),
            ref: primaryResult.created.ref,
          });
          syncDTO(primaryResult.created, 'vector');

          for (let i = 0; i < fx.members.length; i++) {
            const tempId = fx.members[i]!;
            const draft = {
              ...drafts[i + 1]!,
              inReplyTo: primaryResult.created.ref,
              replyType: 'group' as const,
            } as AnnotationDraft;
            const result = await page.annotations.create(draft);
            committed.push({ tempId, ref: result.created.ref });
            apply({
              t: 'created',
              tempId,
              id: refKey(result.created.ref),
              ref: result.created.ref,
            });
            syncDTO(result.created, 'vector');
          }
        } catch (error) {
          // A PDF write cannot be transactional, so compensate in reverse: remove
          // every committed part. Keep any part whose rollback itself fails in the
          // model; the UI must reflect the authoritative PDF, never hide an orphan.
          const removeIds = ids.filter((id) => !committed.some((c) => c.tempId === id));
          for (const part of [...committed].reverse()) {
            try {
              await doc.page(primary.pon).annotations.delete(part.ref);
              removeIds.push(refKey(part.ref));
            } catch {
              // `syncDTO` already made this committed annotation visible.
            }
          }
          if (removeIds.length) apply({ t: 'remove', ids: removeIds });
          console.error('[annotation] grouped annotation creation failed:', error);
        }
      })();
    } else if (fx.fx === 'create') {
      const a = m.byId[fx.id];
      const crop = a && cropOf(a.pon);
      const draft = a && crop ? toCreateDraft(a, crop) : null;
      if (!a || !draft) return;
      doc
        .page(a.pon)
        .annotations.create(draft)
        .then(
          (res) => {
            // Reconcile temp→durable id (keeps selection/order), then attach the
            // authoritative DTO so the committed annotation is fully data-backed.
            apply({
              t: 'created',
              tempId: fx.id,
              id: refKey(res.created.ref),
              ref: res.created.ref,
            });
            // We just drew it — render live, not the engine's freshly-baked AP.
            syncDTO(res.created, 'vector');
          },
          () => apply({ t: 'createFailed', tempId: fx.id }),
        );
    } else if (fx.fx === 'flags') {
      // A `/F`-only write: the model already holds the MERGED flags, so emit
      // the full set (create/update both land on exactly these bits). The
      // re-sync PRESERVES the render source — flags never change an
      // appearance, so a baked raster stays authoritative and nothing
      // re-fetches.
      const a = m.byId[fx.id];
      if (!a || !a.ref || !a.data) return;
      doc
        .page(a.pon)
        .annotations.update(a.ref, {
          subtype: a.data.subtype,
          flags: a.flags,
        } as AnnotationPatch)
        .then(
          (res) => syncDTO(res.updated, a.source),
          (err) => console.error('[annotation] flags write failed:', err),
        );
    } else if (fx.fx === 'patch') {
      const a = m.byId[fx.id];
      const crop = a && cropOf(a.pon);
      const patch = a && a.ref && crop ? toScopedPatch(a, fx.scope, crop) : null;
      if (!a || !a.ref || !patch) return;
      // Re-sync from the authoritative DTO, PRESERVING the source the gesture
      // chose: a move kept it baked (raster rides along), a resize flipped it to
      // vector. So the round-trip can't silently re-bake an edited annotation.
      //
      // `apVersion` is driven by the ENGINE'S echo (`res.appearance.changed`),
      // not by guessing from the patch we sent: the engine value-diffs the
      // patch, verifies rigid translations, and reports whether the document's
      // appearance definition actually changed. Preserved moves (including
      // widget/stamp drags — their /AP survives now) cost zero re-fetches;
      // regenerated appearances re-fetch exactly once, when the engine is
      // done — never one-behind. The core's `fx.apChanged` prediction stays
      // advisory (a future pre-commit "this will replace an imported
      // appearance" affordance); the echo is the authority.
      doc
        .page(a.pon)
        .annotations.update(a.ref, patch)
        .then(
          (res) => {
            syncDTO(res.updated, a.source, res.appearance.changed);
            // Attached link children follow their parent's COMMITTED geometry
            // — scheduled after the parent's own write resolves, from ONE
            // place, so no gesture ever has to know the children exist.
            if (linkChildrenOf(model(), fx.id).length)
              void scheduleLinkSync(fx.id, 'keep');
          },
          () => {},
        );
    } else if (fx.fx === 'syncLink') {
      void scheduleLinkSync(fx.id, { target: fx.target });
    } else {
      doc
        .page(fx.ref.pageObjectNumber)
        .annotations.delete(fx.ref)
        .then(
          () => {},
          () => {},
        );
    }
  }

  return {
    // ── data API: create / update / delete (engine-routed, ref-addressed) ──
    create: async (pon, draft: AnnotationDraft): Promise<AnnotationRef> => {
      const doc = ctx.doc;
      if (!doc) throw new Error('[annotation] no document bound');
      // Default `/F` to `print` (Acrobat parity — without it the annotation
      // disappears when printed). An EXPLICIT `flags` is respected verbatim.
      const withFlags = (
        draft.flags ? draft : { ...draft, flags: { print: true } }
      ) as AnnotationDraft;
      const res = await doc.page(pon).annotations.create(withFlags);
      // Stamps have no vector render — their engine-baked /AP is the visual.
      syncDTO(res.created, res.created.subtype === 'stamp' ? 'baked' : 'vector');
      return res.created.ref;
    },
    armStamp,
    disarmStamp,
    placeArmedStamp,
    requestStampAt,
    placeAt,
    hasArmedStamp: () => armedStamp != null,
    ghostHoverAt,
    clearGhost,
    setPlacementPreview,
    clearPlacementPreview: clearGhost,
    toolGhost: (pon) => {
      const g = ctx.getState().toolGhost;
      return g && g.pon === pon ? g : null;
    },
    armedStampPreview: () => armedStamp?.preview ?? null,
    stampArmEpoch: () => ctx.getState().stampArmEpoch,
    setFilePickerProvider: (provider) => {
      filePickerProvider = provider;
    },
    downloadAttachment: async (ref) => {
      const doc = ctx.doc;
      if (!doc) throw new Error('[annotation] no document bound');
      const pon = ponForRef(ref);
      if (pon == null) throw new Error('[annotation] cannot resolve page for ref');
      const annotations = doc.page(pon).annotations;
      if (!annotations.downloadFile) {
        throw new Error('[annotation] this engine does not support attachment download');
      }
      return annotations.downloadFile(ref);
    },
    // ── tool registry ──
    tools: () => [...registry.values()],
    tool: (id) => registry.get(id) ?? null,
    toolSubtype: (id) => registry.get(id)?.subtype ?? (id as Subtype),
    registerTool: (def: AnnotationToolInput) => {
      // Re-resolve against the same base pool so `extends` can reach built-ins /
      // config tools, then register just this one with the hub + seed its defaults.
      const resolved = buildToolRegistry([...configTools, def]).get(def.id);
      if (!resolved) throw new Error(`[annotation] could not resolve tool '${def.id}'`);
      registry.set(resolved.id, resolved);
      const un = ctx
        .tryGet(InteractionToken)
        ?.registerTool({
          id: resolved.id,
          cursor: resolved.cursor,
          enables: resolved.enables,
          touchDirect: isTouchDirect(resolved.enables),
        });
      if (resolved.defaults)
        apply({ t: 'setDefaults', subtype: resolved.preset, patch: resolved.defaults });
      return () => {
        registry.delete(resolved.id);
        un?.();
      };
    },
    update: (ref: AnnotationRef, patch: AnnotationPatch) => updateOne(ref, patch),
    // Restyle the selection: ONE flat props patch through the pure core (the
    // same `update → patch effect → toPatch` path every gesture takes). Each
    // member takes the keys its kind declares and ignores the rest; the model
    // updates optimistically, the engine writes fire per member and re-sync.
    updateSelection: (patch) => apply({ t: 'setProps', patch }),
    // Flag writes take their own message (NOT the props path): they must never
    // flip a member to vector or re-bake its /AP, and they must work on a
    // LOCKED annotation — unlocking is the point.
    updateSelectionFlags: (patch) => apply({ t: 'setFlags', patch }),
    getSelectionFlags: () => memoSelectionFlags(),
    delete: async (ref: AnnotationRef): Promise<void> => {
      const doc = ctx.doc;
      if (!doc) throw new Error('[annotation] no document bound');
      const pon = ponForRef(ref);
      if (pon == null) throw new Error('[annotation] cannot resolve page for ref');
      await doc.page(pon).annotations.delete(ref);
      apply({ t: 'remove', ids: [refKey(ref)] });
    },

    // ── authorization: per-record mirrors of the engine's collab
    // resolver. `canCreate` asks about the caller's own identity;
    // `canEdit`/`canDelete` about the target's stamped owner. Pure
    // authority — aspect-specific flag gates (`locked` for geometry
    // and delete, `lockedContents` for text) live with the surfaces
    // that touch that aspect (comments.permissionsFor, interaction).
    canCreate: () => allowsCreate(),
    canEdit: (ref) => allowsMutation('update', ref),
    canDelete: (ref) => allowsMutation('delete', ref),

    comments,

    links: {
      of: (ref) => {
        const a = model().byId[refKey(ref)];
        if (!a) return null;
        return a.subtype === 'link' ? (a.link ?? null) : linkOf(model(), a.id);
      },
      // The verbs go straight to the reconciler chain (latest-wins per
      // parent) and resolve when the children are COMMITTED — `of` reads
      // the new value the moment the promise settles.
      set: (ref, target) => scheduleLinkSync(refKey(ref), { target }),
      clear: (ref) => scheduleLinkSync(refKey(ref), { target: null }),
    },

    getSelection: (): AnnotationRef[] => {
      const m = model();
      return m.selected.map((id) => m.byId[id]?.ref).filter((r): r is AnnotationRef => r != null);
    },

    // ── DTO-returning reads (canonical engine vocabulary) ──
    get: (ref: AnnotationRef): AnnotationDTO | null => model().byId[refKey(ref)]?.data ?? null,
    list: (pon: number): AnnotationDTO[] => {
      const m = model();
      return m.order
        .map((id) => m.byId[id])
        .filter((a) => a?.pon === pon)
        .map((a) => a?.data)
        .filter((d): d is AnnotationDTO => d != null);
    },
    getSelected: (): AnnotationDTO[] => {
      const m = model();
      return m.selected.map((id) => m.byId[id]?.data).filter((d): d is AnnotationDTO => d != null);
    },

    // ── property introspection (the schema a sidebar renders from) ──
    getSelectionProps: () => memoSelectionProps(),
    // A tool's editable-prop schema comes from its kind: a callout edits free-text
    // props, an arrow edits line props. The registry holds that mapping.
    propsForTool: (toolId) => propsFor(registry.get(toolId)?.propsKind ?? toolId),

    // selectors
    pageItems: (pon, view) => memoItems(pon, view),
    chrome: (pon, scale, rotation, zoom) => memoChrome(pon, scale, rotation, zoom),
    selectionAnchor: (scale, rotation, zoom) => memoAnchor(scale, rotation, zoom),
    creationDraftAnchor: () => memoDraftAnchor(),
    selection: () => model().selected,
    hitKind: (pon, point, scale, rotation, zoom, touch) =>
      hitTest(
        model(),
        pon,
        point,
        chromeGeomAt(scale, grabBoost(touch)),
        model().hitMargin,
        pageBoxOf(pon),
        inertIdsAt(pon),
        viewEnv(zoom, rotation),
      ).t,
    claimsTouchAt: (pon, point, scale, rotation, zoom) => {
      const m = model();
      const t = hitTest(
        m,
        pon,
        point,
        chromeGeomAt(scale, TOUCH_GRAB_BOOST),
        m.hitMargin,
        pageBoxOf(pon),
        inertIdsAt(pon),
        viewEnv(zoom, rotation),
      );
      // Selection chrome only exists FOR the selection — always a claim (the
      // hit-tester already suppresses handles on kinds/states that can't
      // resize or rotate).
      if (t.t === 'handle' || t.t === 'rotate' || t.t === 'group-handle') return true;
      // A body claims only when a drag would actually ARM A MOVE — mirror the
      // core's edit-down exactly (update.ts editPointer: a hit on a selected
      // member moves the WHOLE selection only if every member canMove). A
      // selected highlight/caret (selectable, not movable) and a locked
      // annotation must keep scrolling, never eat the drag into a dead zone.
      if (t.t === 'annot') {
        return m.selected.includes(t.id) && m.selected.every((id) => canMove(m, id));
      }
      return false;
    },
    cursorAt: (pon, point, scale, rotation, zoom) =>
      cursorAt(
        model(),
        pon,
        point,
        chromeGeomAt(scale),
        model().hitMargin,
        pageBoxOf(pon),
        inertIdsAt(pon),
        viewEnv(zoom, rotation),
      ),
    hoverAt: (at) => {
      const m = model();
      let id: string | null = null;
      if (at) {
        const h = hitTest(
          m,
          at.pon,
          at.point,
          chromeGeomAt(at.scale),
          m.hitMargin,
          pageBoxOf(at.pon),
          inertIdsAt(at.pon),
          viewEnv(at.zoom, at.rotation),
        );
        if (h.t === 'annot') id = h.id;
      }
      // Diff HERE so the reducer sees enter/leave transitions only.
      if (m.hovered !== id) apply({ t: 'hover', id });
    },
    behaviorFor: (a) => behaviors.find((b) => b.matches(a) && b.engaged()) ?? null,
    linkItemsOn: (pon) => memoLinkItems(pon),

    appearanceEpoch: (pon) => {
      // What a baked raster DEPENDS on, and nothing else: which annotations are
      // baked on this page, and each one's /AP content version (`apVersion` —
      // bumped when a size-changing patch RESOLVES, or a remote edit folds in).
      // Position and rotation are deliberately absent: the blit translates
      // (`apBox`) and rotates (`apRot`) the same pixels, so a move or a spin
      // costs zero re-renders — and because the version bumps when the engine
      // CONFIRMS the re-bake, the fetch can never read a stale /AP ("one
      // behind"). Render scale is the shell effect's own dependency.
      const m = model();
      const parts: string[] = [];
      for (const id of m.order) {
        const a = m.byId[id];
        if (!a || a.pon !== pon || a.source !== 'baked' || !a.ref) continue;
        // Conversation-plane annotations never paint — a remote reply or
        // status change must not churn the page's raster cache key.
        if (isSubstrateOnly(a)) continue;
        parts.push(`${id}@${a.apVersion ?? 0}`);
      }
      return parts.sort().join('|');
    },
    bakeScale: (renderScale) =>
      // The render policy is a document FACT off the kernel registry (like
      // `pages`), interpreted by the pure engine-core helper — one lifecycle,
      // one interpretation, no plugin dependency. Identity under continuous.
      snapAppearanceScale(ctx.document()?.renderPolicy ?? CONTINUOUS_RENDER_POLICY, renderScale),
    appearances: (pon, scale, signal) => {
      const doc = ctx.doc;
      if (!doc) return Promise.resolve([]);
      const task = doc.page(pon).annotations.renderAppearanceImages({ scale });
      if (signal) {
        if (signal.aborted) task.abort(signal.reason);
        else signal.addEventListener('abort', () => task.abort(signal.reason), { once: true });
      }
      return task.then(
        (r) => r.appearances,
        () => [],
      );
    },
    toContentBox: (pon, rect) => {
      const crop = cropOf(pon);
      return crop ? pdfToContentRect(rect, crop) : null;
    },

    // intents
    editPointer: (phase, pon, point, shift, scale, rotation, zoom, touch) =>
      apply({
        t: 'editPointer',
        phase,
        in: {
          pon,
          point,
          shift,
          pageBox: pageBoxOf(pon),
          // Touch grabs with the same widened zones the claim used, so the
          // gesture picks up exactly what claimsTouchAt said it would.
          chrome: chromeGeomAt(scale, grabBoost(touch)),
          inert: inertIdsAt(pon),
          // the view env (screen-anchored bodies hit/clamp at their footprint)
          ...(zoom != null ? { zoom } : {}),
          ...(rotation != null ? { displayRotation: rotation } : {}),
        },
      }),
    marqueePointer: (phase, pon, point, shift, scale, rotation, zoom) =>
      apply({
        t: 'marqueePointer',
        phase,
        in: {
          pon,
          point,
          shift,
          pageBox: pageBoxOf(pon),
          inert: inertIdsAt(pon),
          ...(zoom != null ? { zoom } : {}),
          ...(rotation != null ? { displayRotation: rotation } : {}),
        },
      }),
    createPointer: (tool, phase, pon, point, finish = false, displayRotation) => {
      // Resolve the authoring TOOL to its routing subtype + defaults key. Two
      // tools can share a subtype (line / arrow); `preset` keeps their defaults
      // apart. Unknown id → treat it as a bare subtype (headless/programmatic).
      // The tool's `upright` policy + the sample's display rotation ride the
      // input bag; the core captures them on the draft at DOWN.
      const t = registry.get(tool);
      apply({
        t: 'createPointer',
        phase,
        subtype: t?.subtype ?? (tool as Subtype),
        preset: t?.preset ?? tool,
        intent: t?.intent,
        clickCreate: t?.clickCreate,
        flags: t?.flags,
        deferInkCommit: (t?.ink?.groupStrokesMs ?? 0) > 0,
        straightenInk: t?.ink?.straighten,
        in: {
          pon,
          point,
          shift: false,
          finish,
          pageBox: pageBoxOf(pon),
          displayRotation,
          upright: t?.upright,
        },
      });
    },
    finishCreationDraft: () => apply({ t: 'finishCreationDraft' }),
    finishInkDraft: () => apply({ t: 'finishInkDraft' }),
    cancelCreationDraft: () => apply({ t: 'cancel' }),
    markupFromSelection: (subtype, preset) => {
      // One-shot form of the markup tools' commit: selection quads → one
      // markup per page → clear. Selection is an OPTIONAL peer — resolve
      // lazily so annotation keeps working without it installed.
      const selection = ctx.tryGet(SelectionPublicToken);
      if (!selection || !selection.hasSelection()) return false;
      const snapshot = selection.snapshot();
      let created = false;
      for (const page of snapshot.pages) {
        if (!page.segments.length) continue;
        apply({
          t: 'createMarkup',
          subtype,
          pon: page.pon,
          quads: page.segments.map((s) => s.quad),
          preset,
          flags: preset ? registry.get(preset)?.flags : undefined,
        });
        created = true;
      }
      if (created) selection.clear();
      return created;
    },
    createMarkup: (subtype, pon, quads, preset) =>
      // A markup tool's `/F` seed rides along (the preset IS the tool id).
      apply({
        t: 'createMarkup',
        subtype,
        pon,
        quads,
        preset,
        flags: preset ? registry.get(preset)?.flags : undefined,
      }),
    createCaret: (pon, anchor) => apply({ t: 'createCaret', pon, anchor }),
    createReplaceText: (pon, quads, anchor, preset) =>
      apply({ t: 'createReplaceText', pon, quads, anchor, preset }),
    previewMarkup: (subtype, quadsByPage, preset) =>
      apply({ t: 'setMarkupPreview', subtype, quadsByPage, preset }),
    clearMarkupPreview: () => apply({ t: 'clearMarkupPreview' }),
    setDefaults: (subtype, patch) => apply({ t: 'setDefaults', subtype, patch }),
    // Resolve through the tool's `preset` key so arrow reads arrow's defaults, not
    // line's (and the insert-caret tool reads the shared `caret` bag). Falls back
    // to the given id for a bare subtype.
    currentDefaults: (toolId) => defaultsFor(model(), registry.get(toolId)?.preset ?? toolId),
    // Live-adjustable snapping (a UI toggle); seeded by the registration config.
    setSnap: (patch) => apply({ t: 'setSnap', patch }),
    snapSettings: () => model().snap,
    // Live-adjustable selection chrome (theming); seeded by the registration config.
    setChrome: (patch) => ctx.dispatch({ type: 'SET_CHROME', patch }),
    chromeSettings: () => chromeSettings(),
    deleteSelection: () => apply({ t: 'delete' }),
    deselect: () => apply({ t: 'deselect' }),
    select: (ref, options) => {
      apply({ t: 'select', ids: [refKey(ref)], add: options?.add });
    },
    pruneEngagedSelection: () => {
      // Engaged ⇒ hit-test-inert ⇒ must not STAY selected either (a widget
      // selected in design mode keeps no chrome once the fill tool engages).
      const m = model();
      const drop = m.selected.filter((id) => {
        const a = m.byId[id];
        return (
          a && behaviors.some((b) => b.matches({ subtype: a.subtype, ref: a.ref }) && b.engaged())
        );
      });
      if (drop.length) apply({ t: 'deselect', ids: drop });
    },
    cancel: () => apply({ t: 'cancel' }),
    // Rotate the selection a quarter-turn clockwise / reset it to as-authored.
    // Both commit one geometry patch per rotatable member (the same path the
    // rotate-knob gesture uses), so they round-trip through the engine identically.
    rotateSelection90: () => apply({ t: 'rotate90' }),
    resetSelectionRotation: () => apply({ t: 'resetRotation' }),

    // ── grouping (engine `/IRT` + `/RT /Group`; page-local) ──
    /** Group the current selection into one unit: the bottom-most member becomes
     *  the primary, every other member becomes a `/RT /Group` subordinate of it.
     *  No-op unless 2+ committed annotations on a single page are selected. */
    group: async (): Promise<void> => {
      const m = model();
      const members = selectedCommitted();
      if (members.length < 2) return;
      const pon = members[0].pon;
      if (members.some((a) => a.pon !== pon)) return; // groups are page-local
      const ordered = [...members].sort((a, b) => m.order.indexOf(a.id) - m.order.indexOf(b.id));
      const [primary, ...rest] = ordered;
      if (!primary.ref) return;
      await Promise.all(
        rest.map((a) => writeRelationship(a, { inReplyTo: primary.ref, replyType: 'group' })),
      );
    },
    /** Ungroup: clear `/IRT` (+ `/RT`) on every subordinate in the group(s) the
     *  selection touches, so each member becomes top-level again. */
    ungroup: async (): Promise<void> => {
      const m = model();
      const subs = expandGroups(m, m.selected)
        .map((id) => m.byId[id])
        .filter((a): a is Annot => !!a && !!a.ref && !!a.data && !!a.group);
      await Promise.all(subs.map((a) => writeRelationship(a, { inReplyTo: null })));
    },
    canGroup: (): boolean => {
      const m = model();
      const members = selectedCommitted();
      if (members.length < 2) return false;
      if (members.some((a) => a.pon !== members[0].pon)) return false;
      // Grouping WRITES a relationship onto every member — each must
      // pass the per-record update check.
      if (!members.every((a) => a.ref != null && allowsMutation('update', a.ref))) return false;
      // Already exactly one complete group → nothing to do.
      const keys = new Set(m.selected.map((id) => groupKeyOf(m, id)));
      if (keys.size === 1 && !keys.has(null)) return false;
      return true;
    },
    canUngroup: (): boolean => {
      const m = model();
      // Ungrouping clears the relationship on every member of every
      // selected group — same per-record write gate as `ungroup` hits.
      const subs = expandGroups(m, m.selected)
        .map((id) => m.byId[id])
        .filter((a): a is Annot => !!a && !!a.group);
      return subs.length > 0 && subs.every((a) => a.ref != null && allowsMutation('update', a.ref));
    },

    // Whole-document hydration supersedes per-page loading: the model is
    // seeded by `listRawAll()` at document open (see `ensureHydrated`), so
    // a page mount has nothing to fetch. Kept as API for layers/plugins
    // that call it on mount; appearance fetching stays per-page/viewport.
    ensurePage: () => {},

    reloadPage: async (pon) => {
      const doc = ctx.doc;
      const crop = cropOf(pon);
      if (!doc || !crop) return;
      try {
        const snap = await doc.page(pon).annotations.list();
        // Replace, not merge: drop this page's current annots first so
        // cross-plane deletions (deleteField) actually disappear.
        const m = model();
        const stale = m.order.filter((id) => m.byId[id]?.pon === pon);
        if (stale.length) apply({ t: 'remove', ids: stale });
        apply({ t: 'loaded', annots: snap.annotations.map((d) => fromDTO(d, crop)) });
      } catch {
        // A failed reload leaves the previous view; the next event or a
        // rehydrate reconciles.
      }
    },

    hydration: () => ctx.getState().hydration,
    ensureHydrated: () => {
      if (hydrationStarted) return;
      hydrationStarted = true;
      void runHydration(false);
    },
    rehydrate,
    deliverRemoteAnnotationEvent: (event) => {
      if (hydrationWindow) {
        pendingRemote.push(event);
        return;
      }
      applyRemoteAnnotationEvent(event);
    },

    // ── free-text (the editable-element layer) ──
    textItems: (pon, view) => memoTexts(pon, view),
    currentEditing: () => model().editing,
    beginTextEdit: (ref) => apply({ t: 'beginTextEdit', id: refKey(ref) }),
    beginTextEditAt: (pon, point, scale, rotation, zoom) => {
      const m = model();
      const h = hitTest(
        m,
        pon,
        point,
        chromeGeomAt(scale),
        m.hitMargin,
        pageBoxOf(pon),
        undefined,
        viewEnv(zoom, rotation),
      );
      // A double-click on the box body OR one of its resize handles both target the
      // same annotation; either should open it for editing.
      const id = h.t === 'annot' || h.t === 'handle' ? h.id : null;
      if (id != null && m.byId[id]?.geom.t === 'text') {
        apply({ t: 'beginTextEdit', id });
        return true;
      }
      // Nothing editable here — report it so the caller can fall through to a
      // normal press instead of swallowing the gesture on a non-text annotation.
      return false;
    },
    setContents: (ref, text) => {
      apply({ t: 'setText', id: refKey(ref), text }); // optimistic, no engine churn
      const key = refKey(ref);
      clearTimeout(textTimers.get(key));
      textTimers.set(
        key,
        setTimeout(() => {
          textTimers.delete(key);
          const pon = ponForRef(ref);
          if (pon != null) {
            ctx.doc
              ?.page(pon)
              .annotations.update(ref, { subtype: 'free-text', contents: text })
              .then(
                () => {},
                () => {},
              );
          }
        }, TEXT_COMMIT_DEBOUNCE_MS),
      );
    },
    endTextEdit: () => {
      // flush any pending debounced write immediately, then leave edit mode
      for (const t of textTimers.values()) clearTimeout(t);
      const id = model().editing;
      const a = id ? model().byId[id] : null;
      if (a?.ref) {
        const pon = ponForRef(a.ref);
        const text = a.data?.contents ?? '';
        if (pon != null)
          ctx.doc
            ?.page(pon)
            .annotations.update(a.ref, { subtype: 'free-text', contents: text })
            .then(
              () => {},
              () => {},
            );
      }
      textTimers.clear();
      apply({ t: 'endTextEdit' });
    },

    registerBehavior: (b) => {
      behaviors.push(b);
      return () => {
        const i = behaviors.indexOf(b);
        if (i >= 0) behaviors.splice(i, 1);
      };
    },
  };
}
