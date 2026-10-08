/**
 * @embedpdf/react — the generic binding.
 *
 * Binds the kernel's one change stream to React (useSyncExternalStore), resolves
 * capabilities (document-scoped ones against the active or `<DocumentScope>`-given
 * document, with a stand-in while there is none), and provides the page
 * coordinate context. Every plugin and layer rides on this — there is no
 * per-plugin framework code.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/core';
// What a page with a viewer needs from the browser: handing bytes to the user as a download,
// and a font the engine draws with, for text you draw yourself.
export { mountWebFont, saveFile } from '@embedpdf/web';
// The page context every layer draws through; its conversions are shared with every framework.
export { makePageContext } from '@embedpdf/web';
// A theme written with setting names, as the style for the element around a viewer.
export { epdfTheme } from './theme';
export type { EpdfTheme } from './theme';
import * as React from 'react';
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  DocumentsToken,
  createKernel,
  documentState,
  documentsState,
  isLocalEngine,
  shallowEqual,
  standInFor,
  viewerSettingsOf,
} from '@embedpdf/core';
import type {
  AnyPlugin,
  CapabilityToken,
  DocumentInfo,
  DocumentsCapability,
  DocumentsState,
  Engine,
  EngineFactory,
  EventHook,
  FailedDocumentInfo,
  Identity,
  InitialDocument,
  Kernel,
  LockedDocumentInfo,
  PageInfo,
  ViewerPageSettings,
  ViewerSettings,
} from '@embedpdf/core';
// Pure coordinate math from the geometry base — not from stage-core. The
// PageContext seam stays stage-agnostic (it must also serve standalone PageView).
import type { PageTransform } from '@embedpdf/core-geometry';
import type { PageViewDemand } from '@embedpdf/plugin-render/contract';
import { browserClock } from '@embedpdf/web';
import type { PageContext } from '@embedpdf/web';

const KernelCtx = createContext<Kernel | null>(null);
/** The document a subtree is bound to. null => use the active document. */
const DocumentScopeCtx = createContext<string | null>(null);

export function useKernel(): Kernel {
  const kernel = useContext(KernelCtx);
  if (!kernel) throw new Error('useKernel must be used within <Viewer>/<EmbedPDF>');
  return kernel;
}

export interface KernelProviderProps {
  kernel: Kernel;
  children?: React.ReactNode;
}
/**
 * Give a subtree a kernel someone else created and owns, so every hook in it
 * works against that kernel. The full viewer's wrapper puts the children it
 * slots into the viewer inside one. The provider never starts or destroys the
 * kernel; `<Viewer>` is the component that owns one.
 */
export function KernelProvider({ kernel, children }: KernelProviderProps) {
  return <KernelCtx.Provider value={kernel}>{children}</KernelCtx.Provider>;
}

export const shallowArray = <T,>(left: readonly T[], right: readonly T[]): boolean =>
  left === right || (left.length === right.length && left.every((item, i) => item === right[i]));

/** Read a value derived from the kernel, cached by equality (no tearing loop). */
export function useKernelValue<R>(
  select: (kernel: Kernel) => R,
  isEqual: (left: R, right: R) => boolean = Object.is,
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
  return useKernelValue((kernel) => kernel.documents.getActiveId());
}

/** The document id for this subtree: the nearest <DocumentScope>, else the active doc. */
export function useDocumentId(): string | null {
  const scoped = useDocumentScope();
  const active = useActiveDocumentId();
  return scoped ?? active;
}

/**
 * The document the nearest <DocumentScope> binds this subtree to, or null when
 * it follows the active document. For resolvers that pass it to
 * `kernel.tryCapability`, which reads the active document at call time; UI
 * that needs the id itself uses {@link useDocumentId}.
 */
export function useDocumentScope(): string | null {
  return useContext(DocumentScopeCtx);
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
  /** Shown while this subtree has no document: none is open, or it's still opening. */
  fallback?: React.ReactNode;
  /** Shown while the document waits for its password; `fallback` without it. */
  locked?: (document: LockedDocumentInfo) => React.ReactNode;
  /** Shown when the document couldn't be opened, with why; `fallback` without it. */
  error?: (document: FailedDocumentInfo) => React.ReactNode;
  children?: React.ReactNode;
}
/**
 * Render children only while this subtree has a ready document — the
 * structural way to say "this UI is defined over a document". An empty
 * workspace is a legitimate, designable state (the Viewer no longer blocks on
 * documents so chrome can render at t≈0): workspace-scoped UI (toolbars,
 * commands, i18n) lives outside the gate; document-scoped UI (Stage, panels,
 * page chrome) lives inside it. A document that waits for its password, or
 * failed, renders `locked` or `error` with it, or else `fallback`. Sibling of
 * <DocumentScope>, which picks which document; this one handles whether.
 */
export function DocumentGate({ fallback = null, locked, error, children }: DocumentGateProps) {
  const document = useDocument();
  if (document.status === 'ready') return <>{children}</>;
  if (document.status === 'locked' && locked) {
    return <>{locked(document as LockedDocumentInfo)}</>;
  }
  if (document.status === 'error' && error) return <>{error(document as FailedDocumentInfo)}</>;
  return <>{fallback}</>;
}

/**
 * Resolve a capability by token, binding document-scoped ones to this
 * subtree's document. Resolution is a reactive read (`tryCapability` through
 * the kernel's one change stream), not a memoized call — under the
 * request-time lifecycle a document can become resolvable while its id stays
 * the same, so any id-keyed cache goes stale; subscribing makes staleness
 * structurally impossible.
 *
 * Outside a document (none open, not ready yet, or none in scope), a document
 * plugin resolves to its stand-in (`standInFor` from `@embedpdf/core`):
 * rendering never fails, and a method called too early refuses with
 * `not-ready` (a method that returns a promise rejects). A token no plugin
 * provides still throws the kernel's reason, because that is a setup mistake.
 */
export function useCapability<T>(token: CapabilityToken<T>): T {
  const kernel = useKernel();
  const capability = useOptionalCapability(token);
  if (capability) return capability;
  if (kernel.scopeOf(token) === 'document') return standInFor(kernel, token);
  return kernel.capability(token);
}

/** Like `useCapability`, but null while the token can't resolve (no plugin,
 *  no document, or a document that isn't ready yet). */
export function useOptionalCapability<T>(token: CapabilityToken<T>): T | null {
  const scoped = useDocumentScope();
  return useKernelValue((kernel) => kernel.tryCapability(token, scoped ?? undefined));
}

/**
 * Subscribe to a selector over a (document-resolved) capability. Strict:
 * while the token can't resolve, it throws the kernel's reason (`no
 * document`, `document is loading`), for code that knows a document exists,
 * such as anything inside a <DocumentGate>. `useOptionalSelector` is its
 * total twin.
 */
export function useSelector<C, R>(
  token: CapabilityToken<C>,
  select: (capability: C) => R,
  isEqual: (left: R, right: R) => boolean = Object.is,
): R {
  const kernel = useKernel();
  const scoped = useDocumentScope();
  const capability = useOptionalCapability(token) ?? kernel.capability(token, scoped ?? undefined);
  const last = useRef<{ v: R } | null>(null);
  const get = () => {
    const next = select(capability);
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
 *
 * The `select` guard also swallows reads through a capability whose document
 * closed between the store notification and this render — that teardown race
 * resolves to `fallback` for one frame, then re-renders against the new state.
 */
export function useOptionalSelector<C, R>(
  token: CapabilityToken<C>,
  select: (capability: C) => R,
  fallback: R,
  isEqual: (left: R, right: R) => boolean = Object.is,
): R {
  const kernel = useKernel();
  const capability = useOptionalCapability(token);
  const last = useRef<{ v: R } | null>(null);
  const get = () => {
    let next: R;
    if (capability === null) {
      next = fallback;
    } else {
      try {
        next = select(capability);
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

/**
 * Subscribe to a capability's {@link EventHook} for the mounted lifetime —
 * `useCapabilityEvent(ActionsToken, (actions) => actions.onExecuted, handler)`. Events
 * carry occurrences, never state (a late subscriber that needs the current
 * value uses `useSelector`). The handler rides a ref, so a fresh closure per
 * render never resubscribes. Null-safe: no plugin/document → no subscription.
 */
export function useCapabilityEvent<C, T>(
  token: CapabilityToken<C>,
  select: (capability: C) => EventHook<T>,
  handler: (event: T) => void,
): void {
  const capability = useOptionalCapability(token);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const selectRef = useRef(select);
  selectRef.current = select;
  useEffect(() => {
    if (!capability) return;
    return selectRef.current(capability)((event) => handlerRef.current(event));
  }, [capability]);
}

/**
 * The documents API: open, close, unlock, download, and the tabs. Inside a
 * <DocumentScope>, the calls that leave out the document use that one, so
 * `download()` without an id downloads the document in scope. The object
 * never changes, so it's safe in effects and callbacks. What to show comes
 * from `useDocument()` and `useDocumentsState()`.
 */
export function useDocuments(): DocumentsCapability {
  return useCapability(DocumentsToken);
}

/** Read a state declaration's value through the kernel, or the value `select` picks from it. */
function useDeclared<Capability, State extends object, Selected>(
  token: CapabilityToken<Capability>,
  read: (capability: Capability) => State,
  empty: State,
  select: ((state: State) => Selected) | undefined,
): Selected {
  const scoped = useDocumentScope();
  return useKernelValue((kernel) => {
    const capability = kernel.tryCapability(token, scoped ?? undefined);
    const state = capability ? read(capability) : empty;
    return select ? select(state) : (state as unknown as Selected);
  }, shallowEqual);
}

/**
 * The document this component talks to: the one its <DocumentScope> names, or
 * else the active one. Its `id`, `name`, `status`, `pageCount`,
 * `hasUnsavedChanges`, and why it's locked or failed. With no document, an
 * empty one that reads as still opening. Takes a selector, and re-renders only
 * when what it returns changes.
 */
export function useDocument<Selected = DocumentInfo>(
  select?: (document: DocumentInfo) => Selected,
): Selected {
  return useDeclared(DocumentsToken, documentState.read, documentState.empty, select);
}

/**
 * Every open document, in tab order (loading, locked and failed ones too),
 * and the active one's id. Takes a selector, and re-renders only when what it
 * returns changes.
 */
export function useDocumentsState<Selected = DocumentsState>(
  select?: (state: DocumentsState) => Selected,
): Selected {
  return useDeclared(DocumentsToken, documentsState.read, documentsState.empty, select);
}

/** Subscribe to one documents event for the mounted lifetime: `useDocumentsEvent((documents) => documents.onOpened, handler)`. */
export function useDocumentsEvent<T>(
  select: (documents: DocumentsCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(DocumentsToken, select, handler);
}

const NO_PAGES: readonly PageInfo[] = Object.freeze([]);

/**
 * The pages of the document this component talks to, in order: each with its
 * `ref`, `index`, `label`, size and rotation. Needs no Stage, so a thumbnail
 * list or a page picker works anywhere. The same array until a page is added,
 * removed, moved or rotated; empty with no document.
 */
export function usePageList(): readonly PageInfo[] {
  const documentId = useDocumentId();
  return useKernelValue((kernel) =>
    documentId ? kernel.documents.listPages(documentId) : NO_PAGES,
  );
}

/**
 * The viewer's own settings (`<Viewer identity scope accent page>`), or the
 * value `select` picks from them: the accent every part without a color of its
 * own follows, and how pages look. What paints a page or an accent reads it
 * here, through `paint()` from `@embedpdf/web`, so a CSS variable still wins.
 */
export function useViewerSettings<Selected = ViewerSettings>(
  select?: (settings: ViewerSettings) => Selected,
): Selected {
  return useKernelValue((kernel) => {
    const settings = kernel.getSettings();
    return select ? select(settings) : (settings as unknown as Selected);
  }, shallowEqual);
}

// `InitialDocument` is the kernel's type (re-exported via `export * from
// '@embedpdf/core'` above) — one shared shape for every adapter.

export interface ViewerProps {
  /**
   * The engine, as an instance or a thunk. Engines construct synchronously and
   * boot lazily (`localEngine()` allocates nothing until first use), so
   * ownership follows the shape of what you pass:
   *
   *   - An **instance** (`engine={engine}`) is borrowed: the Viewer uses it and
   *     never destroys it, because you acquired it and therefore own it. The
   *     common path — a module-scope `const engine = localEngine()` shared
   *     across viewers and route changes. The Viewer warms up a local engine
   *     on mount so the boot overlaps app initialization.
   *   - A **thunk** (`engine={() => localEngine()}`) is viewer-owned: the
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
  /** Called once the kernel has started — before `children` mount and before
   *  `initialDocuments` open. The imperative door for code outside React
   *  (register commands, subscribe events). The `ref` carries the same kernel. */
  onReady?: (kernel: Kernel) => void;
  /**
   * Who the user is, for every document opened without an `identity` of its
   * own (which replaces this one). Documents opened after a change use the new
   * value; open ones keep theirs. The local engine only: the cloud engine reads
   * it from the document's token.
   */
  identity?: Identity;
  /**
   * What the user may do, as permissions, in every document opened without a
   * `scope` of its own (which replaces this one). Left out, they may do
   * everything. Changes reach the documents opened after them, as `identity`.
   */
  scope?: readonly string[];
  /** The color every part without a color of its own follows. CSS `--epdf-accent` wins over it. */
  accent?: string;
  /** How pages look: `background` before the picture arrives, and the `shadow` under each page. */
  page?: Partial<ViewerPageSettings>;
  children?: React.ReactNode;
}

type BootState =
  | { phase: 'booting'; kernel: Kernel | null }
  | { phase: 'ready'; kernel: Kernel }
  | { phase: 'error'; error: unknown };

/**
 * Owns the kernel as an effect-scoped resource: each effect setup creates and
 * starts exactly one kernel; each cleanup destroys exactly that one. That is
 * the contract StrictMode exercises (two kernels in dev, the first fully
 * destroyed) — the kernel itself is never restarted after destroy.
 *
 * The kernel is published to context the moment it exists — before `start()`
 * resolves — so the `fallback` can use workspace capabilities (i18n copy on a
 * loading screen). The one exception is the very first render, which happens
 * before the effect: it renders nothing. Children mount once `start()` resolves
 * — which never touches the engine, so the shell is alive while WASM compiles
 * or the transport connects. `initialDocuments` open in the background and
 * stream into the registry (`useDocuments()` is reactive); per-document
 * loading UI is the Stage's job, not a root gate.
 *
 * Engine ownership. When `engine` is a thunk, the Viewer owns it: each effect
 * setup constructs one engine (construction is synchronous and inert — boot
 * happens lazily inside the engine) and each cleanup destroys exactly that one
 * — after the kernel, so handles close first. When `engine` is an instance it
 * is borrowed and never destroyed here; the Viewer only warms up a local
 * engine so the WASM boot overlaps plugin initialization. StrictMode's
 * double-mount therefore constructs two independent thunk engines and tears
 * the first fully down, matching the kernel's own effect-scoped lifecycle.
 * That means dev-only double resource use (two worker spawns, two font
 * fetches, briefly overlapping) — deliberate, because it is exactly the
 * leak-detection contract StrictMode exists to exercise; production mounts
 * once and boots once.
 */
export const Viewer = forwardRef<Kernel | null, ViewerProps>(function Viewer(
  {
    engine,
    plugins,
    initialDocuments,
    fallback,
    renderError,
    onReady,
    identity,
    scope,
    accent,
    page,
    children,
  }: ViewerProps,
  ref,
) {
  // Init-only inputs: the kernel's lifetime is the component's lifetime, so a
  // changed engine/plugins identity cannot mean "rebuild the workspace" —
  // that would silently drop every open document. Capture once, warn in dev.
  const initial = useRef({ engine, plugins, initialDocuments });
  // The viewer's settings follow the props. The first ones go to the kernel when it's
  // created, so the initial documents open with them; later ones as they change.
  const settings = viewerSettingsOf({ identity, scope, accent, page });
  const latestSettings = useRef(settings);
  latestSettings.current = settings;
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
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  // The ref is the started kernel (null before boot and after an error).
  useImperativeHandle<Kernel | null, Kernel | null>(
    ref,
    () => (boot.phase === 'ready' ? boot.kernel : null),
    [boot],
  );
  useEffect(() => {
    const captured = initial.current;
    // A thunk is viewer-owned: call it now, destroy on unmount. An instance is
    // borrowed: use as-is, never destroy. Construction is synchronous and inert
    // either way — the engine boots lazily on first use — so a local engine's
    // `warmup()` overlaps the WASM boot with plugin initialization.
    const ownsEngine = typeof captured.engine === 'function';
    const engine: Engine = ownsEngine
      ? (captured.engine as EngineFactory)()
      : (captured.engine as Engine);
    if (isLocalEngine(engine)) engine.warmup();
    let kernel: Kernel;
    try {
      kernel = createKernel({
        engine,
        plugins: captured.plugins,
        settings: latestSettings.current,
        clock: browserClock(),
      });
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
        onReadyRef.current?.(kernel);
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
      // Kernel first (closes every document handle), then the engine we own —
      // ownership follows acquisition. `engine.destroy()` joins an in-flight
      // boot (or no-ops if it never started), so an unmount mid-boot is safe.
      void kernel.destroy().then(() => {
        if (ownsEngine) void engine.destroy();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After every render: props compare by value (an inline `page={{ shadow: 'none' }}` is a new
  // object each time), and settings that didn't change change nothing.
  const liveKernel = boot.phase === 'error' ? null : boot.kernel;
  useEffect(() => {
    liveKernel?.updateSettings(latestSettings.current);
  });

  if (boot.phase === 'error') {
    return <>{renderError ? renderError(boot.error) : null}</>;
  }
  if (!boot.kernel) return null; // pre-effect first render only
  return (
    <KernelCtx.Provider value={boot.kernel}>
      {boot.phase === 'ready' ? children : (fallback ?? null)}
    </KernelCtx.Provider>
  );
});
export const EmbedPDF = Viewer;

/**
 * PageContext — the seam. A layer depends only on this, never on the Stage. So the
 * same layer works inside a virtualized Stage and in a standalone <PageView>.
 * Its members are documented on `PageContext` in `@embedpdf/web`.
 */
export type PageContextValue = PageContext<PageTransform, PageViewDemand>;

const PageCtx = createContext<PageContextValue | null>(null);
export const PageProvider = PageCtx.Provider;

export function usePage(): PageContextValue {
  const context = useContext(PageCtx);
  if (!context) throw new Error('usePage must be used inside <PageView> or a <Stage> page');
  return context;
}
