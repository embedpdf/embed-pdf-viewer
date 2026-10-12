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
 */
import { ActionsToken, type ActionsCapability } from '@embedpdf/react/actions';
import { AnnotationToken, type AnnotationCapability } from '@embedpdf/react/annotation';
import { CommandsToken, type CommandsCapability } from '@embedpdf/react/commands';
import { FormToken, type FormCapability } from '@embedpdf/react/form';
import { I18nToken, type I18nCapability } from '@embedpdf/react/i18n';
import { InteractionToken, type InteractionCapability } from '@embedpdf/react/interaction';
import { LinkToken, type LinkCapability } from '@embedpdf/react/link';
import { MeasurementToken, type MeasurementCapability } from '@embedpdf/react/measurement';
import { PageEditToken, type PageEditCapability } from '@embedpdf/react/page-edit';
import { RedactionToken, type RedactionCapability } from '@embedpdf/react/redaction';
import { RenderToken, type RenderCapability } from '@embedpdf/react/render';
import { DocumentsToken } from '@embedpdf/react/runtime';
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

/** Each plugin's API, by the plugin's name: what `viewer.get(name)` returns. */
export interface ViewerPlugins {
  readonly stage: StageCapability;
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
   * viewer has no such plugin, or when the plugin belongs to a document and none is open.
   */
  get<Name extends PluginName>(name: Name): ViewerPlugins[Name];
  get<Capability>(token: CapabilityToken<Capability>): Capability;
  /**
   * Like `get`, but `null` when the plugin isn't available: none by that name, no document, or
   * one still opening.
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

/** Make the `viewer` from a live kernel; `plugins` are the names its `get()` takes. */
export function createViewer(kernel: Kernel, plugins: PluginTokens): Viewer {
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
      return kernel.capability(tokenOf(plugin), documentId);
    }
    function tryGet<Name extends PluginName>(name: Name): ViewerPlugins[Name] | null;
    function tryGet<Capability>(token: CapabilityToken<Capability>): Capability | null;
    function tryGet(plugin: string | CapabilityToken<unknown>): unknown {
      const token = typeof plugin === 'string' ? tokenNamed(plugin) : plugin;
      return token ? kernel.tryCapability(token, documentId) : null;
    }
    return { get, tryGet };
  };

  const watch = <T>(
    read: () => T,
    onChange: (value: T, previous: T) => void,
    isEqual: (left: T, right: T) => boolean = Object.is,
  ): Unsubscribe => {
    let previous = read();
    return kernel.subscribe(() => {
      const next = read();
      if (isEqual(previous, next)) return;
      const before = previous;
      previous = next;
      onChange(next, before);
    });
  };

  const viewer: Viewer = {
    ...scopedTo(undefined),
    documents: kernel.documents,
    commands: kernel.capability(CommandsToken),
    forDocument: scopedTo,
    watch,
  };
  // Not part of the viewer's API: the framework wrappers read it to give the components they
  // slot into the viewer this kernel, so headless hooks work there. Non-enumerable, and keyed
  // by a registered symbol so a wrapper reads it without importing this package.
  Object.defineProperty(viewer, VIEWER_KERNEL, { value: kernel });
  return viewer;
}
