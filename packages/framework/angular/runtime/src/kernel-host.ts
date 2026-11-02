/**
 * The viewer behind `provideEmbedPdf()`: one per injector that provides it. In the browser it
 * creates the kernel as soon as the engine is there (at once for an engine instance, later for a
 * factory that loads one), starts it, opens the initial documents, runs the features' `setup`,
 * and destroys it all with the injector. Given a kernel (`provideEmbedPdf({ kernel })`), it uses
 * that one as it is, and leaves starting and destroying it to whoever made it.
 *
 * The kernel has one change stream; the host turns each change into a write of `revision`, and
 * every signal in the adapter is a `computed()` over it (`read()`), which keeps its value, and
 * wakes nothing, while what it reads is unchanged.
 *
 * On the server the host creates no kernel: every read gives its empty value and a call that
 * needs the engine throws EPDF-105, so the page around the viewer still renders.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  Injector,
  PLATFORM_ID,
  runInInjectionContext,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import {
  createKernel,
  DocumentsToken,
  isLocalEngine,
  PluginError,
  shallowEqual,
  VIEWER_DEFAULTS,
  VIEWER_WHOLE_SETTINGS,
  viewerSettingsOf,
} from '@embedpdf/core';
import type {
  AnyPlugin,
  CapabilityToken,
  DeepPartial,
  Engine,
  EventHook,
  Kernel,
  KernelStatus,
  SettingsApi,
  SettingsDeclaration,
  ViewerSettings,
} from '@embedpdf/core';
import { browserClock, browserPrinter, browserTextMeasurer } from '@embedpdf/web';
import { Observable } from 'rxjs';
import type { EmbedPdfConfig, EmbedPdfKernelConfig, EpdfViewerStatus } from './config';
import { onServerError } from './errors';
import { SettingsBeforeStart } from './settings-before-start';
import { EPDF_SETUP } from './tokens';

/**
 * The viewer's settings as the config gives them (a setting left out is its default), the same
 * way every framework's viewer reads its props; what `resetSettings()` goes back to. A kernel
 * given has its own.
 */
const registeredViewerSettings = (config: EmbedPdfConfig | EmbedPdfKernelConfig): ViewerSettings =>
  viewerSettingsOf('kernel' in config ? {} : config);

/**
 * Whether `kernel` has a plugin that provides `token`. A document plugin's token has its scope
 * (any other token reads as a workspace one), and a workspace plugin's capability is there from
 * the moment the kernel is created.
 */
const kernelProvides = (kernel: Kernel, token: CapabilityToken<unknown>): boolean =>
  kernel.scopeOf(token) === 'document' || kernel.tryCapability(token) !== null;

/** The settings of the plugin that provides `token` in `kernel`, or null when it has none. */
function kernelSettingsOf<T extends object>(
  kernel: Kernel,
  token: CapabilityToken<unknown>,
): SettingsApi<T> | null {
  try {
    return kernel.settingsOf(token) as unknown as SettingsApi<T>;
  } catch {
    // The kernel's answer for a token no plugin provides, or a plugin without settings.
    return null;
  }
}

/** What the viewer is doing, as a kernel someone else started says it. */
const statusOfKernel = (status: KernelStatus): EpdfViewerStatus =>
  status === 'started' ? 'ready' : status === 'failed' ? 'error' : 'starting';

/** A plugin's settings, readable and changeable before the kernel exists and after. */
export interface PluginSettingsBinding<T> {
  readonly current: Signal<T>;
  update(change: DeepPartial<T>): void;
  reset(): void;
}

const isPromiseLike = <T>(value: T | Promise<T>): value is Promise<T> =>
  typeof (value as { then?: unknown }).then === 'function';

@Injectable()
export class EpdfKernelHost {
  private readonly setup = inject(EPDF_SETUP);
  private readonly injector = inject(Injector);
  /** Whether this is a browser. On the server the host creates no kernel. */
  readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** The kernel `provideEmbedPdf({ kernel })` was given: someone else's, used as it is. */
  private readonly given: Kernel | null =
    'kernel' in this.setup.config ? this.setup.config.kernel : null;
  /** Every plugin the features register, in their order: none for a kernel given, which has its own. */
  readonly plugins: readonly AnyPlugin[] = this.given
    ? []
    : this.setup.features.flatMap((feature) => feature.plugins);

  private readonly kernelState = signal<Kernel | null>(null);
  private readonly revisionState = signal(0);
  private readonly statusState = signal<EpdfViewerStatus>('starting');
  private readonly errorState = signal<unknown>(null);
  private readonly listeners = new Set<() => void>();
  private readonly viewerSettingsBeforeStart = new SettingsBeforeStart<ViewerSettings>({
    defaults: VIEWER_DEFAULTS,
    registered: registeredViewerSettings(this.setup.config),
    whole: VIEWER_WHOLE_SETTINGS,
  });
  private readonly pluginSettings = new Map<
    CapabilityToken<unknown>,
    PluginSettingsBinding<object>
  >();
  private readonly pluginSettingsBeforeStart = new Map<AnyPlugin, SettingsBeforeStart<object>>();
  private engine: Engine | null = null;
  private ownsEngine = false;
  private stopListening: (() => void) | null = null;
  private destroyed = false;

  /**
   * The kernel, once it exists: null while a lazily loaded engine is on its way, and on the
   * server, where only a kernel given is there.
   */
  readonly kernel: Signal<Kernel | null> = this.kernelState.asReadonly();
  /** Goes up on every change of the kernel's state. */
  readonly revision: Signal<number> = this.revisionState.asReadonly();
  /** A kernel given says it itself: someone else starts it. */
  readonly status: Signal<EpdfViewerStatus> = this.given
    ? this.read(
        (kernel) => statusOfKernel(kernel.status()),
        () => 'starting',
      )
    : this.statusState.asReadonly();
  /** Why the viewer failed to start, when `status()` is `'error'`. */
  readonly error: Signal<unknown> = this.errorState.asReadonly();
  /** The viewer's own settings, before the kernel exists and after. */
  readonly viewerSettings: Signal<ViewerSettings> = this.read(
    (kernel) => kernel.getSettings(),
    () => this.viewerSettingsBeforeStart.current(),
    shallowEqual,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.destroy());
    const { config } = this.setup;
    // A kernel given is the kernel, wherever it was made.
    if ('kernel' in config) this.adopt(config.kernel);
    if (!this.browser) return;
    if (!('kernel' in config)) this.start(config);
    // After construction, because a feature's setup injects services, and they inject this host.
    queueMicrotask(() => this.runFeatureSetups());
  }

  /**
   * A value read from the kernel, as a signal: `select` runs again after each change of the
   * kernel's state, and the signal changes only when `equal` says the value did. `empty` is its
   * value while there is no kernel.
   */
  read<R>(
    select: (kernel: Kernel) => R,
    empty: () => R,
    equal: (left: R, right: R) => boolean = Object.is,
  ): Signal<R> {
    return computed(
      () => {
        this.revisionState();
        const kernel = this.kernelState();
        return kernel ? select(kernel) : empty();
      },
      { equal },
    );
  }

  /** Call `listener` after each change of the kernel's state, and once when the kernel arrives. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * An event of the kernel itself (its settings, a plugin's settings store), as an RxJS
   * stream. A subscription made before the kernel exists starts listening when it arrives.
   */
  stream<T>(pick: (kernel: Kernel) => EventHook<T>): Observable<T> {
    return new Observable<T>((subscriber) => {
      let listening: AbortController | null = null;
      const listen = () => {
        const kernel = untracked(this.kernelState);
        if (!kernel || listening) return;
        listening = new AbortController();
        pick(kernel)((event) => subscriber.next(event), { signal: listening.signal });
      };
      const stop = this.subscribe(listen);
      listen();
      return () => {
        stop();
        listening?.abort();
      };
    });
  }

  /** Whether a plugin of this viewer provides `token` (the documents are always there). */
  provides(token: CapabilityToken<unknown>): boolean {
    if (token === DocumentsToken) return true;
    return this.given ? kernelProvides(this.given, token) : this.pluginFor(token) !== null;
  }

  /** Whether the plugin of this viewer that provides `token` has settings. */
  hasSettings(token: CapabilityToken<unknown>): boolean {
    return this.given
      ? kernelSettingsOf(this.given, token) !== null
      : Boolean(this.pluginFor(token)?.settings);
  }

  /**
   * The kernel, for `call` (`'zoomIn()'`) on `capability` (`'stage'`), which needs it now:
   * `not-ready` while the engine is still on its way, EPDF-105 on the server.
   */
  requireKernel(capability: string, call: string): Kernel {
    const kernel = this.kernelState();
    if (kernel) return kernel;
    if (!this.browser) throw onServerError(call);
    throw new PluginError('not-ready', capability, 'the viewer is still starting');
  }

  updateViewerSettings(change: DeepPartial<ViewerSettings>): void {
    const kernel = this.kernelState();
    if (kernel) kernel.updateSettings(change);
    else this.viewerSettingsBeforeStart.update(change);
  }

  resetViewerSettings(): void {
    const kernel = this.kernelState();
    if (kernel) kernel.resetSettings();
    else this.viewerSettingsBeforeStart.reset();
  }

  /**
   * A plugin's settings, with or without a document, and before the kernel too: they belong to
   * the plugin as the app registered it. One binding per plugin, shared by every service.
   */
  settingsOf<T extends object>(token: CapabilityToken<unknown>): PluginSettingsBinding<T> {
    const known = this.pluginSettings.get(token);
    if (known) return known as PluginSettingsBinding<T>;
    const binding = this.given
      ? this.givenSettingsOf<T>(this.given, token)
      : this.registeredSettingsOf<T>(token);
    this.pluginSettings.set(token, binding as PluginSettingsBinding<object>);
    return binding;
  }

  /** A registered plugin's settings, kept from before the kernel exists. */
  private registeredSettingsOf<T extends object>(
    token: CapabilityToken<unknown>,
  ): PluginSettingsBinding<T> {
    const plugin = this.pluginFor(token);
    const declaration = plugin?.settings as SettingsDeclaration<T> | undefined;
    if (!plugin || !declaration) {
      throw new PluginError('unsupported', token.name, 'this plugin has no settings');
    }

    const before = new SettingsBeforeStart<T>(declaration);
    this.pluginSettingsBeforeStart.set(plugin, before as SettingsBeforeStart<object>);
    const store = (kernel: Kernel) => kernel.settingsOf(token) as unknown as SettingsApi<T>;
    return {
      current: this.read(
        (kernel) => store(kernel).getSettings(),
        () => before.current(),
        shallowEqual,
      ),
      update: (change) => {
        const kernel = this.kernelState();
        if (kernel) store(kernel).updateSettings(change);
        else before.update(change);
      },
      reset: () => {
        const kernel = this.kernelState();
        if (kernel) store(kernel).resetSettings();
        else before.reset();
      },
    };
  }

  /** A plugin's settings in a kernel given, which is there from the start. */
  private givenSettingsOf<T extends object>(
    kernel: Kernel,
    token: CapabilityToken<unknown>,
  ): PluginSettingsBinding<T> {
    const store = kernelSettingsOf<T>(kernel, token);
    if (!store) throw new PluginError('unsupported', token.name, 'this plugin has no settings');
    const current = () => store.getSettings();
    return {
      current: this.read(current, current, shallowEqual),
      update: (change) => store.updateSettings(change),
      reset: () => store.resetSettings(),
    };
  }

  private pluginFor(token: CapabilityToken<unknown>): AnyPlugin | null {
    return this.plugins.find((plugin) => plugin.token === token) ?? null;
  }

  // ── lifetime ────────────────────────────────────────────────────────────────

  /** Follow a kernel someone else made: its changes, and nothing of its lifetime. */
  private adopt(kernel: Kernel): void {
    this.stopListening = kernel.subscribe(() => this.changed());
    this.kernelState.set(kernel);
    this.changed();
  }

  private start(config: EmbedPdfConfig): void {
    const source = config.engine;
    const owned = typeof source === 'function';
    let made: Engine | Promise<Engine>;
    try {
      made = owned ? source() : source;
    } catch (error) {
      this.fail(error);
      return;
    }
    if (isPromiseLike(made)) {
      made.then(
        (engine) => this.attach(config, engine, owned),
        (error: unknown) => this.fail(error),
      );
    } else {
      this.attach(config, made, owned);
    }
  }

  /** Create and start the kernel over `engine`. An engine this viewer made is destroyed with it. */
  private attach(config: EmbedPdfConfig, engine: Engine, owned: boolean): void {
    if (this.destroyed) {
      if (owned) void engine.destroy();
      return;
    }
    // Warming a local engine up now overlaps its WebAssembly boot with the plugins' setup.
    if (isLocalEngine(engine)) engine.warmup();
    let kernel: Kernel;
    try {
      kernel = createKernel({
        engine,
        plugins: [...this.plugins],
        settings: registeredViewerSettings(config),
        clock: browserClock(),
        printer: browserPrinter(),
        measurer: browserTextMeasurer(),
        fetch: config.fetch,
      });
    } catch (error) {
      if (owned) void engine.destroy();
      this.fail(error);
      return;
    }
    this.engine = engine;
    this.ownsEngine = owned;
    this.viewerSettingsBeforeStart.applyTo(kernel);
    for (const [plugin, before] of this.pluginSettingsBeforeStart) {
      before.applyTo(kernel.settingsOf(plugin.token as CapabilityToken<unknown>));
    }
    this.stopListening = kernel.subscribe(() => this.changed());
    this.kernelState.set(kernel);
    this.changed();
    kernel.start().then(
      () => {
        if (this.destroyed) return;
        this.statusState.set('ready');
        // Every tab appears at once, in order; a document that fails shows it in its own tab.
        kernel.documents.openAll(config.initialDocuments ?? []);
      },
      (error: unknown) => {
        if (!this.destroyed) this.fail(error);
      },
    );
  }

  private changed(): void {
    this.revisionState.update((revision) => revision + 1);
    for (const listener of [...this.listeners]) listener();
  }

  private fail(error: unknown): void {
    this.errorState.set(error);
    this.statusState.set('error');
    console.error('[embedpdf] the viewer failed to start', error);
  }

  private runFeatureSetups(): void {
    if (this.destroyed) return;
    for (const feature of this.setup.features) {
      if (feature.setup) runInInjectionContext(this.injector, feature.setup);
    }
  }

  private destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopListening?.();
    this.listeners.clear();
    // A kernel given is its maker's to destroy.
    if (this.given) return;
    const kernel = this.kernelState();
    const engine = this.engine;
    const owned = this.ownsEngine;
    // The kernel first, which closes every document's engine handle, then the engine it ran on.
    if (kernel) {
      void kernel.destroy().then(() => {
        if (owned && engine) void engine.destroy();
      });
    }
  }
}
