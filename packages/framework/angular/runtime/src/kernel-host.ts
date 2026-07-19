/**
 * The kernel host — one service owns the kernel; ONE tick signal bridges the
 * kernel's single change stream into Angular's signal graph. Everything else in
 * this adapter is `computed()` over it (`value()` is Angular's `useKernelValue`).
 *
 * Two hosting modes share this class:
 *   component-hosted  `<epdf-viewer [engine] [plugins]>`  (framework parity)
 *   provider-hosted   `provideEmbedPdf({...})` at route/app level
 *
 * CONSTRUCTION RULE (library law): nothing may read `host.kernel` while a
 * component is being CONSTRUCTED. Component-hosted configs resolve their inputs
 * lazily, so the kernel materializes on first real read (a template binding, an
 * effect) — after inputs are set. Every inject* primitive returns signals or
 * lazy methods and therefore respects this for free; only the raw
 * `injectKernel()` escape hatch can violate it (its doc says so).
 *
 * SSR CONTRACT: the EmbedPDF subtree is browser-only. On the server the host
 * never boots and any `kernel` read throws — wrap the viewer region in `@defer`
 * (which renders its placeholder on the server) or a platform-guarded `@if`.
 */
import {
  computed,
  inject,
  Injectable,
  makeEnvironmentProviders,
  PLATFORM_ID,
  signal,
  type EnvironmentProviders,
  type OnDestroy,
  type Signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createKernel } from '@embedpdf/core';
import type { AnyPlugin, Engine, InitialDocument, Kernel, Unsubscribe } from '@embedpdf/core';

/** One boot document — the KERNEL's shared `InitialDocument` shape (same as
 *  the React adapter's), aliased under the package's Epdf naming. */
export type EpdfInitialDocument = InitialDocument;

export interface EmbedPdfConfig {
  /** The engine, or a factory for it (pair with `deferredEngine()` so route
   *  providers never block on WASM/transport). Init-only: the kernel is never
   *  rebuilt for a new engine — tear the host down (destroy the viewer /
   *  injector) and create a new one. */
  engine: Engine | (() => Engine);
  /** Init-only, like `engine`. */
  plugins: AnyPlugin[];
  /** Documents to open on startup (with optional tab names). They open in the
   *  BACKGROUND after start and stream into the registry — `injectDocuments()`
   *  is reactive; per-document loading UI is the Stage's job. A source that
   *  fails to open lands in `error` and does NOT block the ones after it. */
  initialDocuments?: EpdfInitialDocument[];
}

/** `starting` covers construction through `kernel.start()`; `ready` means the
 *  workspace is live (documents may still be opening in the background). */
export type EpdfKernelStatus = 'starting' | 'ready' | 'error';

const resolveEngine = (engine: Engine | (() => Engine)): Engine =>
  typeof engine === 'function' ? engine() : engine;

@Injectable()
export class EpdfKernelHost implements OnDestroy {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private config: (() => EmbedPdfConfig) | null = null;
  private _kernel: Kernel | null = null;
  private unsubscribe: Unsubscribe | null = null;
  private initialDocuments: EpdfInitialDocument[] | undefined;
  private booted = false;
  private destroyed = false;

  /** Bumped on every kernel notification — THE bridge from kernel-world to signals. */
  private readonly tick = signal(0);

  /** Boot lifecycle. `ready`/`error` are derived sugar over it. */
  readonly status = signal<EpdfKernelStatus>('starting');
  /** The STARTUP failure, if any. Per-document open failures are tab state
   *  (`DocInfo.status === 'error'`), not host state. */
  readonly error = signal<unknown>(null);
  /** True once `kernel.start()` resolved — which never touches the engine, so
   *  the shell (and every workspace capability: i18n, view-manager, …) is alive
   *  while WASM compiles or the transport connects. Workspace chrome may render
   *  before this; gate on it (or on the document gate) where it matters. */
  readonly ready: Signal<boolean> = computed(() => this.status() === 'ready');

  /** Register the (deferred) config. Called exactly once, by `EpdfViewer`'s
   *  constructor or `provideEmbedPdf`'s factory. */
  connect(config: () => EmbedPdfConfig): void {
    if (this.config || this._kernel) {
      throw new Error('[embedpdf] kernel already configured for this injector');
    }
    this.config = config;
  }

  /** The kernel — materialized on first read (see the construction rule above). */
  get kernel(): Kernel {
    if (!this._kernel) {
      if (!this.browser) {
        throw new Error(
          '[embedpdf] the viewer does not render on the server — wrap the EmbedPDF subtree in @defer (its placeholder renders during SSR) or a browser-only @if',
        );
      }
      if (!this.config) {
        throw new Error(
          '[embedpdf] no kernel: wrap this subtree in <epdf-viewer> or add provideEmbedPdf(...) to your providers',
        );
      }
      const { engine, plugins, initialDocuments } = this.config();
      this._kernel = createKernel({ engine: resolveEngine(engine), plugins });
      this.initialDocuments = initialDocuments;
      this.unsubscribe = this._kernel.subscribe(() => this.tick.update((n) => n + 1));
    }
    return this._kernel;
  }

  /** Start the kernel and open initial documents in the background. Idempotent;
   *  a no-op on the server and after destroy. */
  boot(): void {
    if (this.booted || this.destroyed || !this.browser) return;
    this.booted = true;
    const kernel = this.kernel;
    void (async () => {
      try {
        await kernel.start();
      } catch (err) {
        if (!this.destroyed) {
          this.error.set(err);
          this.status.set('error');
        }
        return;
      }
      if (this.destroyed) return;
      this.status.set('ready');
      // Kernel-owned boot policy: all tabs appear immediately in array order;
      // the `active` entry (else the first) is selected; per-document
      // failures surface as that tab's `error`/`locked` status (this host's
      // `error` signal reports only startup failures).
      kernel.documents.openAll(this.initialDocuments ?? []);
    })();
  }

  /** Read a value derived from the kernel, cached by equality — Angular's
   *  `useKernelValue`. The selector re-runs per kernel notification (cheap);
   *  `equal` decides whether dependents ever see it. */
  value<R>(select: (kernel: Kernel) => R, equal: (a: R, b: R) => boolean = Object.is): Signal<R> {
    return computed(
      () => {
        this.tick();
        return select(this.kernel);
      },
      { equal },
    );
  }

  ngOnDestroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe?.();
    // destroy() owns the full teardown now: it joins an in-flight start, closes
    // every document (engine handles included), and unwinds workspace plugins.
    // Async + idempotent, so fire-and-forget is safe in a sync ngOnDestroy.
    if (this._kernel) void this._kernel.destroy();
  }
}

/**
 * Host the kernel in an environment injector (route or application providers).
 * The kernel's lifetime is the injector's — a route-level workspace tears down
 * when the route does. Unlocks chrome OUTSIDE any viewer subtree: a toolbar in
 * the app header and the stage in the main outlet share this one kernel.
 */
export function provideEmbedPdf(config: EmbedPdfConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: EpdfKernelHost,
      useFactory: () => {
        const host = new EpdfKernelHost();
        host.connect(() => config);
        host.boot();
        return host;
      },
    },
  ]);
}
