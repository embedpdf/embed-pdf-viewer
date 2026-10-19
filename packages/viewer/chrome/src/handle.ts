/**
 * The `viewer`: how an app reaches the viewer from code (`element.viewer`, `onReady`).
 *
 * A thin skin over the kernel: `get()` returns each plugin's public capability exactly as the
 * plugin defines it, by the plugin's name or its token, and adds no facade, no second vocabulary
 * and no second write path. `documents` and `commands` are two of those capabilities, with their
 * own events. `watch()` is the kernel's one change stream, selector-shaped: `useSelector` without
 * a framework.
 *
 * The chrome runs on these same capabilities, so what the viewer's own buttons can do and what
 * an app's code can do are the same by construction.
 *
 * A `viewer` lives as long as the viewer it reaches. Once that one unmounts, or mounts again
 * with a new config, it is done: the listeners added through it stop, and its calls refuse with
 * `instance-closed` (see {@link createViewer}).
 */
import { ActionsToken, type ActionsCapability } from '@embedpdf/react/actions';
import { AnnotationToken, type AnnotationCapability } from '@embedpdf/react/annotation';
import { CommandsToken, type CommandsCapability } from '@embedpdf/react/commands';
import { FontsToken, type FontsCapability } from '@embedpdf/react/fonts';
import { FormToken, type FormCapability } from '@embedpdf/react/form';
import { I18nToken, type I18nCapability } from '@embedpdf/react/i18n';
import { InteractionToken, type InteractionCapability } from '@embedpdf/react/interaction';
import { LinkToken, type LinkCapability } from '@embedpdf/react/link';
import { MeasurementToken, type MeasurementCapability } from '@embedpdf/react/measurement';
import { MetadataToken, type MetadataCapability } from '@embedpdf/react/metadata';
import { OutlineToken, type OutlineCapability } from '@embedpdf/react/outline';
import { PageEditToken, type PageEditCapability } from '@embedpdf/react/page-edit';
import { RedactionToken, type RedactionCapability } from '@embedpdf/react/redaction';
import { RenderToken, type RenderCapability } from '@embedpdf/react/render';
import { DocumentsToken, PluginError, isReadMember } from '@embedpdf/react/runtime';
import type {
  CapabilityToken,
  DocumentsCapability,
  Kernel,
  Unsubscribe,
} from '@embedpdf/react/runtime';
import { SearchToken, type SearchCapability } from '@embedpdf/react/search';
import { SelectionToken, type SelectionCapability } from '@embedpdf/react/selection';
import { ShellToken, type ShellCapability } from '@embedpdf/react/shell';
import { SignatureToken, type SignatureCapability } from '@embedpdf/react/signature';
import { StageToken, type StageCapability } from '@embedpdf/react/stage';
import { StampToken, type StampCapability } from '@embedpdf/react/stamp';

import { ThumbsStageToken } from './config/stage';

/** Each plugin's API, by the plugin's name: what `viewer.get(name)` returns. */
export interface ViewerPlugins {
  readonly stage: StageCapability;
  /** The thumbnails panel's Stage: a second lens over the same document. */
  readonly thumbnails: StageCapability;
  readonly render: RenderCapability;
  readonly link: LinkCapability;
  readonly selection: SelectionCapability;
  readonly search: SearchCapability;
  readonly annotation: AnnotationCapability;
  readonly stamp: StampCapability;
  readonly measurement: MeasurementCapability;
  readonly redaction: RedactionCapability;
  readonly form: FormCapability;
  readonly signature: SignatureCapability;
  readonly pageEdit: PageEditCapability;
  /** The document's title, author and your own fields; `ensureLoaded()` reads them. */
  readonly metadata: MetadataCapability;
  /** The document's fonts, and the CSS and programs its typed text is drawn in; reading its state reads them. */
  readonly fonts: FontsCapability;
  /** The document's outline (its bookmarks); reading its state reads it. */
  readonly outline: OutlineCapability;
  readonly actions: ActionsCapability;
  readonly documents: DocumentsCapability;
  readonly interaction: InteractionCapability;
  readonly commands: CommandsCapability;
  readonly shell: ShellCapability;
  readonly i18n: I18nCapability;
}

/** A plugin's name, as `viewer.get()` and the `plugins` config take it. */
export type PluginName = keyof ViewerPlugins;

/**
 * The viewer's plugins by name: the names `get()` takes, the same as the `plugins` config's.
 * Only plugins the viewer registers are here, so every name resolves.
 */
export const VIEWER_PLUGINS: {
  readonly [Name in PluginName]: CapabilityToken<ViewerPlugins[Name]>;
} = {
  stage: StageToken,
  thumbnails: ThumbsStageToken,
  render: RenderToken,
  link: LinkToken,
  selection: SelectionToken,
  search: SearchToken,
  annotation: AnnotationToken,
  stamp: StampToken,
  measurement: MeasurementToken,
  redaction: RedactionToken,
  form: FormToken,
  signature: SignatureToken,
  pageEdit: PageEditToken,
  metadata: MetadataToken,
  fonts: FontsToken,
  outline: OutlineToken,
  actions: ActionsToken,
  documents: DocumentsToken,
  interaction: InteractionToken,
  commands: CommandsToken,
  shell: ShellToken,
  i18n: I18nToken,
};

/** `get`/`tryGet` bound to one document (see {@link Viewer.forDocument}). */
export interface ScopedViewer {
  /**
   * A plugin's API, by its name (`'search'`) or its token (`SearchToken`). Throws when the
   * viewer has no such plugin, when the plugin belongs to a document and none is open, and
   * `instance-closed` once the viewer is done.
   */
  get<Name extends PluginName>(name: Name): ViewerPlugins[Name];
  get<Capability>(token: CapabilityToken<Capability>): Capability;
  /**
   * Like `get`, but `null` when the plugin isn't available: none by that name, no document, one
   * still opening, or the viewer is done.
   */
  tryGet<Name extends PluginName>(name: Name): ViewerPlugins[Name] | null;
  tryGet<Capability>(token: CapabilityToken<Capability>): Capability | null;
}

/** The viewer, from code: `element.viewer`, and what `onReady` gets. */
export interface Viewer extends ScopedViewer {
  /** The documents: open, close, switch, download, and their events. `get('documents')`. */
  readonly documents: DocumentsCapability;
  /** The commands: run one, read one, turn features on and off, and their events. `get('commands')`. */
  readonly commands: CommandsCapability;

  /** `get`/`tryGet` for one document, whether it's the active one or not. */
  forDocument(documentId: string): ScopedViewer;

  /**
   * Run `read` on every change in the viewer, and call `onChange` when what it returns changed
   * (`isEqual`, default `Object.is`: capability getters return the same object until their value
   * changes, so identity works). Returns a function that stops it.
   */
  watch<T>(
    read: () => T,
    onChange: (value: T, previous: T) => void,
    isEqual?: (left: T, right: T) => boolean,
  ): Unsubscribe;
}

/** The key of the kernel on a {@link Viewer}, for the framework wrappers only. */
export const VIEWER_KERNEL: unique symbol = Symbol.for('@embedpdf/viewer/kernel');

/** The plugins a viewer resolves by name: {@link VIEWER_PLUGINS}, or more. */
export type PluginTokens = Readonly<Record<string, CapabilityToken<unknown>>>;

/** A `viewer`, and the end of its life. */
export interface ViewerLifetime {
  readonly viewer: Viewer;
  /**
   * The viewer it reaches is gone: every listener added through the `viewer` stops, and every
   * call refuses with `instance-closed`. Idempotent.
   */
  dispose(): void;
}

const GONE =
  'this viewer is gone: it was unmounted, or mounted again with a new config. Use the viewer ' +
  'the new onReady gives you.';

/** A member that subscribes: an event (`onOpened`) or a registration (`registerTool`). */
const SUBSCRIBES = /^(?:on|register)(?:[A-Z]|$)/;

const isPlainObject = (value: unknown): value is object => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Make the `viewer` from a live kernel; `plugins` are the names its `get()` takes.
 *
 * Every API the `viewer` hands out (`get()`, `documents`, `commands`) is the plugin's own
 * capability seen through a lens that ends with the viewer: while it lives, every member is the
 * capability's; once {@link ViewerLifetime.dispose} runs, the listeners and registrations made
 * through it are removed, a read (`get*`, `list*`, `is*`, `has*`, `can*`) throws
 * `instance-closed`, every other call returns a promise that rejects with it, and a new
 * subscription does nothing.
 */
export function createViewer(kernel: Kernel, plugins: PluginTokens): ViewerLifetime {
  let disposed = false;
  const subscriptions = new Set<Unsubscribe>();
  const goneError = (capability: string) => new PluginError('instance-closed', capability, GONE);

  /** Keep a subscription made through the viewer, so `dispose()` can end it. */
  const keep = (unsubscribe: Unsubscribe): Unsubscribe => {
    const end = () => {
      subscriptions.delete(end);
      unsubscribe();
    };
    subscriptions.add(end);
    return end;
  };

  const lenses = new WeakMap<object, object>();
  /** The capability (or one of its namespaces, `annotation.comments`) as the viewer hands it out. */
  const lensOf = <Api extends object>(api: Api, capability: string): Api => {
    const existing = lenses.get(api);
    if (existing) return existing as Api;
    const members = new Map<string, { readonly value: unknown; readonly member: unknown }>();
    const memberOf = (key: string, value: (...args: unknown[]) => unknown): unknown => {
      if (SUBSCRIBES.test(key)) {
        return (...args: unknown[]) => {
          if (disposed) return () => {};
          const unsubscribe = value.apply(api, args);
          return typeof unsubscribe === 'function' ? keep(unsubscribe as Unsubscribe) : unsubscribe;
        };
      }
      if (isReadMember(key)) {
        return (...args: unknown[]) => {
          if (disposed) throw goneError(capability);
          return value.apply(api, args);
        };
      }
      return (...args: unknown[]) =>
        disposed ? Promise.reject(goneError(capability)) : value.apply(api, args);
    };
    const read = (key: string | symbol): unknown => {
      const value: unknown = Reflect.get(api, key, api);
      if (typeof key === 'symbol') return value;
      if (isPlainObject(value)) return lensOf(value, capability);
      if (typeof value !== 'function') return value;
      // The same function on every read, while the capability's member is the same.
      const known = members.get(key);
      if (known?.value === value) return known.member;
      const member = memberOf(key, value as (...args: unknown[]) => unknown);
      members.set(key, { value, member });
      return member;
    };
    // Over an empty object rather than the capability, so a frozen capability's members can be
    // handed out as the lens's own.
    const lens = new Proxy(
      {},
      {
        get: (_target, key) => read(key),
        has: (_target, key) => Reflect.has(api, key),
        ownKeys: () => Reflect.ownKeys(api),
        getOwnPropertyDescriptor: (_target, key) => {
          const own = Reflect.getOwnPropertyDescriptor(api, key);
          return own && { configurable: true, enumerable: own.enumerable, value: read(key) };
        },
      },
    ) as Api;
    lenses.set(api, lens);
    return lens;
  };

  const tokenNamed = (name: string): CapabilityToken<unknown> | null =>
    Object.prototype.hasOwnProperty.call(plugins, name) ? (plugins[name] ?? null) : null;
  const tokenOf = (plugin: string | CapabilityToken<unknown>): CapabilityToken<unknown> => {
    if (typeof plugin !== 'string') return plugin;
    const token = tokenNamed(plugin);
    if (!token) {
      throw new Error(
        `[embedpdf] the viewer has no plugin named "${plugin}". Its plugins: ` +
          `${Object.keys(plugins).join(', ')}.`,
      );
    }
    return token;
  };

  const scopedTo = (documentId: string | undefined): ScopedViewer => {
    function get<Name extends PluginName>(name: Name): ViewerPlugins[Name];
    function get<Capability>(token: CapabilityToken<Capability>): Capability;
    function get(plugin: string | CapabilityToken<unknown>): unknown {
      const token = tokenOf(plugin);
      if (disposed) throw goneError(token.name);
      return lensOf(kernel.capability(token, documentId) as object, token.name);
    }
    function tryGet<Name extends PluginName>(name: Name): ViewerPlugins[Name] | null;
    function tryGet<Capability>(token: CapabilityToken<Capability>): Capability | null;
    function tryGet(plugin: string | CapabilityToken<unknown>): unknown {
      const token = typeof plugin === 'string' ? tokenNamed(plugin) : plugin;
      const api = token && !disposed ? kernel.tryCapability(token, documentId) : null;
      return api === null ? null : lensOf(api as object, token!.name);
    }
    return { get, tryGet };
  };

  const watch = <T>(
    read: () => T,
    onChange: (value: T, previous: T) => void,
    isEqual: (left: T, right: T) => boolean = Object.is,
  ): Unsubscribe => {
    if (disposed) return () => {};
    let previous = read();
    return keep(
      kernel.subscribe(() => {
        const next = read();
        if (isEqual(previous, next)) return;
        const before = previous;
        previous = next;
        onChange(next, before);
      }),
    );
  };

  const viewer: Viewer = {
    ...scopedTo(undefined),
    documents: lensOf(kernel.documents, DocumentsToken.name),
    commands: lensOf(kernel.capability(CommandsToken), CommandsToken.name),
    forDocument: scopedTo,
    watch,
  };
  // Not part of the viewer's API: the framework wrappers read it to give the components they
  // slot into the viewer this kernel, so headless hooks work there. Non-enumerable, and keyed
  // by a registered symbol so a wrapper reads it without importing this package.
  Object.defineProperty(viewer, VIEWER_KERNEL, { value: kernel });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const end of [...subscriptions]) end();
  };
  return { viewer, dispose };
}

/**
 * The `viewer` of the kernel a viewer runs on now: one per kernel, made once it has started
 * (before anything renders), and done when it goes. Your commands reach it as `viewer`, and
 * `onReady` gets the same one.
 */
export interface ViewerSlot {
  /** The `viewer` for this kernel: made the first time, the same one after that. */
  attach(kernel: Kernel): Viewer;
  /** The `viewer` now, or `null` before a kernel has started and after it went. */
  current(): Viewer | null;
  /** This kernel went: its `viewer` is done. Another kernel's stays. */
  release(kernel: Kernel): void;
}

export function createViewerSlot(plugins: PluginTokens): ViewerSlot {
  let held: { readonly kernel: Kernel; readonly lifetime: ViewerLifetime } | null = null;
  return {
    attach: (kernel) => {
      if (held?.kernel !== kernel) {
        held?.lifetime.dispose();
        held = { kernel, lifetime: createViewer(kernel, plugins) };
      }
      return held.lifetime.viewer;
    },
    current: () => held?.lifetime.viewer ?? null,
    release: (kernel) => {
      if (held?.kernel !== kernel) return;
      held.lifetime.dispose();
      held = null;
    },
  };
}
