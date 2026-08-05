/**
 * @embedpdf/react — the generic binding.
 *
 * Binds the kernel's one change stream to React (useSyncExternalStore), resolves
 * capabilities (document-scoped ones against the active or `<DocumentScope>`-given
 * document), and provides the page coordinate context. Every plugin and layer rides
 * on this — there is no per-plugin framework code.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/core';
import * as React from 'react';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createKernel, docInfoListEquals } from '@embedpdf/core';
import type {
  AnyPlugin,
  CapabilityToken,
  Engine,
  EngineFactory,
  InitialDocument,
  Kernel,
} from '@embedpdf/core';
// Pure coordinate math from the geometry base — NOT from stage-core. The
// PageContext seam stays stage-agnostic (it must also serve standalone PageView).
import type { PageFrame, PageTransform, Point, Rect } from '@embedpdf/core-geometry';
import type { PageViewDemand } from '@embedpdf/plugin-render';

const KernelCtx = createContext<Kernel | null>(null);
/** The document a subtree is bound to. null => use the active document. */
const DocumentScopeCtx = createContext<string | null>(null);

export function useKernel(): Kernel {
  const k = useContext(KernelCtx);
  if (!k) throw new Error('useKernel must be used within <Viewer>/<EmbedPDF>');
  return k;
}

export const shallowArray = <T,>(a: readonly T[], b: readonly T[]): boolean =>
  a === b || (a.length === b.length && a.every((x, i) => x === b[i]));

/** Read a value derived from the kernel, cached by equality (no tearing loop). */
export function useKernelValue<R>(
  select: (k: Kernel) => R,
  isEqual: (a: R, b: R) => boolean = Object.is,
): R {
  const kernel = useKernel();
  const last = useRef<{ v: R } | null>(null);
  const get = () => {
    const next = select(kernel);
    if (last.current && isEqual(last.current.v, next)) return last.current.v;
    last.current = { v: next };
    return next;
  };
  return useSyncExternalStore(kernel.subscribe, get, get);
}

export function useActiveDocumentId(): string | null {
  return useKernelValue((k) => k.documents.activeId());
}

/** The document id for this subtree: the nearest <DocumentScope>, else the active doc. */
export function useDocumentId(): string | null {
  const scoped = useContext(DocumentScopeCtx);
  const active = useActiveDocumentId();
  return scoped ?? active;
}

export interface DocumentScopeProps {
  id: string;
  children: React.ReactNode;
}
/** Bind a subtree to a specific document (panes, comparison). */
export function DocumentScope({ id, children }: DocumentScopeProps) {
  return <DocumentScopeCtx.Provider value={id}>{children}</DocumentScopeCtx.Provider>;
}

export interface DocumentGateProps {
  /** Shown while this subtree has NO document (empty workspace, docs still opening). */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}
/**
 * Render children only while this subtree has a READY document — the
 * structural way to say "this UI is defined over a document". An empty
 * workspace is a legitimate, designable state (the Viewer no longer blocks on
 * documents so chrome can render at t≈0): workspace-scoped UI (toolbars,
 * commands, i18n) lives OUTSIDE the gate; document-scoped UI (Stage, panels,
 * page chrome) lives inside it, or reads through `useOptionalSelector`.
 * A `loading`/`locked`/`error` tab renders `fallback` — so the gate's
 * fallback doubles as the per-tab boot state; richer chrome (a password
 * prompt, an error pane) branches on `useDocumentStatus()` beside the gate.
 * Sibling of <DocumentScope>, which picks WHICH document; this one handles
 * WHETHER.
 */
export function DocumentGate({ fallback = null, children }: DocumentGateProps) {
  const docId = useDocumentId();
  const ready = useKernelValue((k) => (docId ? k.documents.get(docId)?.status === 'ready' : false));
  return <>{ready ? children : fallback}</>;
}

/** Lifecycle status of this subtree's document (loading/locked/ready/error),
 *  or null with no document. The password prompt and error panes key off it. */
export function useDocumentStatus() {
  const docId = useDocumentId();
  return useKernelValue((k) => (docId ? (k.documents.get(docId)?.status ?? null) : null));
}

/**
 * Resolve a capability by token, binding document-scoped ones to this
 * subtree's document. Resolution is a REACTIVE read (`tryCapability` through
 * the kernel's one change stream), not a memoized call — under the
 * request-time lifecycle a document can become resolvable while its id stays
 * the same, so any id-keyed cache goes stale; subscribing makes staleness
 * structurally impossible. Fail-fast: while unresolvable, this re-runs the
 * strict resolver so the kernel's truthful reason (`no capability` / `no
 * document` / `document is loading|locked`) is what throws.
 */
export function useCapability<T>(token: CapabilityToken<T>): T {
  const kernel = useKernel();
  const scoped = useContext(DocumentScopeCtx);
  const cap = useKernelValue((k) => k.tryCapability(token, scoped ?? undefined));
  return cap ?? kernel.capability(token, scoped ?? undefined);
}

/** Like `useCapability`, but null while the token can't resolve (no plugin,
 *  no document, or a document that isn't ready yet). */
export function useOptionalCapability<T>(token: CapabilityToken<T>): T | null {
  const scoped = useContext(DocumentScopeCtx);
  return useKernelValue((k) => k.tryCapability(token, scoped ?? undefined));
}

/** Subscribe to a selector over a (document-resolved) capability. */
export function useSelector<C, R>(
  token: CapabilityToken<C>,
  select: (cap: C) => R,
  isEqual: (a: R, b: R) => boolean = Object.is,
): R {
  const kernel = useKernel();
  const cap = useCapability(token);
  const last = useRef<{ v: R } | null>(null);
  const get = () => {
    const next = select(cap);
    if (last.current && isEqual(last.current.v, next)) return last.current.v;
    last.current = { v: next };
    return next;
  };
  return useSyncExternalStore(kernel.subscribe, get, get);
}

/**
 * Null-safe `useSelector`: `fallback` whenever the token can't resolve — no
 * provider, or a document-scoped token with no document. For chrome that stays
 * mounted across the empty-workspace state (a zoom readout, a mode band).
 * `useSelector` stays strict (fail-fast) for code that KNOWS a document exists
 * — e.g. anything inside a <DocumentGate>.
 *
 * The `select` guard also swallows reads through a capability whose document
 * closed between the store notification and this render — that teardown race
 * resolves to `fallback` for one frame, then re-renders against the new state.
 */
export function useOptionalSelector<C, R>(
  token: CapabilityToken<C>,
  select: (cap: C) => R,
  fallback: R,
  isEqual: (a: R, b: R) => boolean = Object.is,
): R {
  const kernel = useKernel();
  const cap = useOptionalCapability(token);
  const last = useRef<{ v: R } | null>(null);
  const get = () => {
    let next: R;
    if (cap === null) {
      next = fallback;
    } else {
      try {
        next = select(cap);
      } catch {
        next = fallback;
      }
    }
    if (last.current && isEqual(last.current.v, next)) return last.current.v;
    last.current = { v: next };
    return next;
  };
  return useSyncExternalStore(kernel.subscribe, get, get);
}

/** The document registry (open/close/active/list), reactive. */
export function useDocuments() {
  const kernel = useKernel();
  const docs = useKernelValue((k) => k.documents.list(), docInfoListEquals);
  const activeId = useActiveDocumentId();
  return {
    docs,
    activeId,
    open: kernel.documents.open,
    unlock: kernel.documents.unlock,
    close: kernel.documents.close,
    setActive: kernel.documents.setActive,
    move: kernel.documents.move,
    swap: kernel.documents.swap,
    download: kernel.documents.download,
    downloadLayer: kernel.documents.downloadLayer,
  };
}

// `InitialDocument` is the KERNEL's type (re-exported via `export * from
// '@embedpdf/core'` above) — one shared shape for every adapter.

export interface ViewerProps {
  /**
   * The engine, as an instance or a thunk. Engines construct synchronously and
   * boot lazily (`localEngine()` allocates nothing until first use), so
   * ownership follows the SHAPE of what you pass:
   *
   *   - An **instance** (`engine={engine}`) is BORROWED: the Viewer uses it and
   *     never destroys it, because you acquired it and therefore own it. The
   *     common path — a module-scope `const engine = localEngine()` shared
   *     across viewers and route changes. The Viewer calls `engine.warmup?.()`
   *     on mount so the boot overlaps app initialization.
   *   - A **thunk** (`engine={() => localEngine()}`) is VIEWER-OWNED: the
   *     Viewer calls it on mount and `destroy()`s the result on unmount. Use it
   *     for per-mount isolation (StrictMode/HMR-clean teardown, independent
   *     multi-viewer engines).
   *
   * Init-only: captured on first render; later identity changes are ignored (dev warns).
   */
  engine: Engine | EngineFactory;
  /** Init-only: captured on first render; later identity changes are ignored (dev warns). */
  plugins: AnyPlugin[];
  /** Documents to open on startup (with optional tab names). Init-only. */
  initialDocuments?: InitialDocument[];
  fallback?: React.ReactNode;
  /** Rendered when kernel construction or `start()` fails. Without it a boot
   *  failure renders nothing — but never a silent forever-fallback. */
  renderError?: (error: unknown) => React.ReactNode;
  children: React.ReactNode;
}

type BootState =
  | { phase: 'booting'; kernel: Kernel | null }
  | { phase: 'ready'; kernel: Kernel }
  | { phase: 'error'; error: unknown };

/**
 * Owns the kernel as an EFFECT-scoped resource: each effect setup creates and
 * starts exactly one kernel; each cleanup destroys exactly that one. That is
 * the contract StrictMode exercises (two kernels in dev, the first fully
 * destroyed) — the kernel itself is never restarted after destroy.
 *
 * The kernel is published to context the moment it exists — before `start()`
 * resolves — so the `fallback` can use workspace capabilities (i18n copy on a
 * loading screen) exactly as before. The one exception is the very first
 * render, which happens before the effect: it renders nothing. Children mount
 * once `start()` resolves — which never touches the engine, so the shell is
 * alive while WASM compiles or the transport connects. `initialDocuments`
 * open in the BACKGROUND and stream into the registry (`useDocuments()` is
 * reactive); per-document loading UI is the Stage's job, not a root gate.
 *
 * ENGINE OWNERSHIP. When `engine` is a thunk, the Viewer OWNS it: each effect
 * setup constructs one engine (construction is synchronous and inert — boot
 * happens lazily inside the engine) and each cleanup destroys exactly that one
 * — after the kernel, so handles close first. When `engine` is an instance it
 * is BORROWED and never destroyed here; the Viewer only calls `warmup?.()` so
 * the WASM/transport boot overlaps plugin initialization. StrictMode's
 * double-mount therefore constructs two independent thunk engines and tears
 * the first fully down, matching the kernel's own effect-scoped lifecycle.
 * That means dev-only double resource use (two worker spawns, two font
 * fetches, briefly overlapping) — deliberate, because it is exactly the
 * leak-detection contract StrictMode exists to exercise; production mounts
 * once and boots once.
 */
export function Viewer({
  engine,
  plugins,
  initialDocuments,
  fallback,
  renderError,
  children,
}: ViewerProps) {
  // Init-only inputs: the kernel's lifetime is the component's lifetime, so a
  // changed engine/plugins identity cannot mean "rebuild the workspace" —
  // that would silently drop every open document. Capture once, warn in dev.
  const initial = useRef({ engine, plugins, initialDocuments });
  const warned = useRef(false);
  if (process.env.NODE_ENV !== 'production' && !warned.current) {
    if (initial.current.engine !== engine || initial.current.plugins !== plugins) {
      warned.current = true;
      console.warn(
        '[embedpdf] <Viewer> engine/plugins are init-only. A changed identity is ignored — ' +
          'pass stable references (module scope, useState, or useMemo). ' +
          'An inline `plugins={[...]}` array recreates its identity every render.',
      );
    }
  }

  const [boot, setBoot] = useState<BootState>({ phase: 'booting', kernel: null });
  useEffect(() => {
    const captured = initial.current;
    // A thunk is viewer-owned: call it now, destroy on unmount. An instance is
    // borrowed: use as-is, never destroy. Construction is synchronous and inert
    // either way — the engine boots lazily on first use — so kick `warmup()`
    // to overlap the WASM/transport boot with plugin initialization.
    const ownsEngine = typeof captured.engine === 'function';
    const engine: Engine = ownsEngine
      ? (captured.engine as EngineFactory)()
      : (captured.engine as Engine);
    engine.warmup?.();
    let kernel: Kernel;
    try {
      kernel = createKernel({ engine, plugins: captured.plugins });
    } catch (error) {
      setBoot({ phase: 'error', error }); // plan/graph errors surface, not throw mid-render
      if (ownsEngine) void engine.destroy();
      return;
    }
    let alive = true;
    setBoot({ phase: 'booting', kernel }); // context carries the kernel from this frame on
    kernel.start().then(
      () => {
        if (!alive) return; // unmounted mid-boot — don't open anything
        setBoot({ phase: 'ready', kernel });
        // Kernel-owned boot policy: all tabs appear immediately in array
        // order; the `active` entry (else the first) is selected; failures
        // surface as tab status. See DocumentsCapability.openAll.
        kernel.documents.openAll(captured.initialDocuments ?? []);
      },
      (error) => {
        if (alive) setBoot({ phase: 'error', error });
      },
    );
    return () => {
      alive = false;
      // Kernel first (closes every document handle), THEN the engine we own —
      // ownership follows acquisition. `engine.destroy()` joins an in-flight
      // boot (or no-ops if it never started), so an unmount mid-boot is safe.
      void kernel.destroy().then(() => {
        if (ownsEngine) void engine.destroy();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (boot.phase === 'error') {
    return <>{renderError ? renderError(boot.error) : null}</>;
  }
  if (!boot.kernel) return null; // pre-effect first render only
  return (
    <KernelCtx.Provider value={boot.kernel}>
      {boot.phase === 'ready' ? children : (fallback ?? null)}
    </KernelCtx.Provider>
  );
}
export const EmbedPDF = Viewer;

/**
 * PageContext — the seam. A layer depends ONLY on this, never on the Stage. So the
 * same layer works inside a virtualized Stage and in a standalone <PageView>.
 */
export interface PageContextValue {
  documentId: string;
  /** Durable page identity (PDF object number) — use for keys / render / annotations. */
  pon: number;
  /** Display index (page N) — use for ordering / human-facing page numbers. */
  pageIndex: number;
  /**
   * Reserved chrome bands around the page (screen px per side). The page-chrome
   * slot renders into the outer box (content + frame); these thicknesses size
   * the bands — a label in the bottom band is `bottom:0; height: frame.bottom`.
   */
  frame: PageFrame;
  /**
   * The single bridge between PDF points, view px, and device px for this page.
   * Layers do ALL coordinate work through it — `pageToContent` to place content-
   * space overlays, `renderScale`/`deviceWidth` to render, `contentWidth` for
   * page-relative sizing. Never re-derive `x * scale` or `* dpr`.
   */
  transform: PageTransform;
  /** Client (screen) point → PDF point — the one platform-bound hit-test. */
  toPagePoint(clientX: number, clientY: number): Point;
  /** PDF/content point → client (screen) px — the exact inverse of `toPagePoint`
   *  (rotation applied). Lets viewport-space UI (e.g. a selection menu) anchor to a
   *  page point WITHOUT a Stage camera, so it works the same in `<PageView>`. */
  toClientPoint(p: Point): Point;
  /** PDF/content rect → client (screen) px AABB. Rect analog of `toClientPoint`
   *  for upright viewport-space UI that frames a selected page region. */
  toClientRect(rect: Rect): Rect;
  /**
   * The page-view DEMAND for raster planning (SCALE-OUT §2.1e dependency
   * inversion): plugin-render defines the shape; the host that CREATED this
   * context fills it — as a PULL. The Stage host's getter closes over the
   * stage capability and reads `VisiblePage.visibleRect` live at call time
   * (visibility is the STAGE's data; adapters never re-derive camera math or
   * cache a copy). Three states, three meanings: a real sub-rect (visible),
   * a ZERO rect (stage host, page currently off-screen — want nothing), and
   * an undefined getter (stage-less `<PageView>` — whole page visible, which
   * a thumbnail-sized demand turns into "never engages" by arithmetic).
   */
  getViewDemand?: () => PageViewDemand;
}

const PageCtx = createContext<PageContextValue | null>(null);
export const PageProvider = PageCtx.Provider;

export function usePage(): PageContextValue {
  const c = useContext(PageCtx);
  if (!c) throw new Error('usePage must be used inside <PageView> or a <Stage> page');
  return c;
}

export function makePageContext(
  documentId: string,
  pon: number,
  pageIndex: number,
  frame: PageFrame,
  transform: PageTransform,
  getRect: () => DOMRect,
  getViewDemand?: () => PageViewDemand,
): PageContextValue {
  return {
    documentId,
    pon,
    pageIndex,
    frame,
    transform,
    ...(getViewDemand ? { getViewDemand } : {}),
    toPagePoint: (cx, cy) => {
      // `getRect()` is the rotated content wrapper's axis-aligned bounding box =
      // the page's DISPLAY box on screen. Convert client → box-local view px,
      // then invert rotation + scale via the transform (verified once in geometry,
      // not re-derived per framework adapter).
      const r = getRect();
      return transform.viewToPage({ x: cx - r.left, y: cy - r.top });
    },
    toClientPoint: (p) => {
      // Exact inverse of `toPagePoint`: page/content point → display-box view px
      // (rotation applied by the transform), offset by the same live display-box
      // origin. So the two can never drift, in either <Stage> or <PageView>.
      const r = getRect();
      const v = transform.pageToView(p);
      return { x: r.left + v.x, y: r.top + v.y };
    },
    toClientRect: (rect) => {
      const r = getRect();
      const v = transform.pageToViewRect(rect);
      return { x: r.left + v.x, y: r.top + v.y, width: v.width, height: v.height };
    },
  };
}
