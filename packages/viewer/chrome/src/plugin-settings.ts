/**
 * The `plugins` config: each built-in plugin's settings by the plugin's name, and plugins of your
 * own.
 *
 * A built-in's settings merge over the viewer's own for that plugin the way every plugin merges
 * settings (`mergeSettings`: plain objects key by key, arrays and other values whole). Two
 * plugins take settings only the viewer has, next to their own: `stamp` (the standard stamps, the
 * quick stamps) and `signature` (which marks people keep, the fonts for typed ones). A plugin
 * definition under a name the viewer doesn't use joins the viewer, and `viewer.get(name)` is its
 * API. Anything else is left out, with a warning that names the closest plugin.
 */
import { didYouMean } from '@embedpdf/core-ui';
import { mergeSettings, type AnyPlugin, type DeepPartial } from '@embedpdf/react/runtime';
import type { actionsPlugin } from '@embedpdf/react/actions';
import type { annotationPlugin } from '@embedpdf/react/annotation';
import type { commandsPlugin } from '@embedpdf/react/commands';
import type { formPlugin } from '@embedpdf/react/form';
import type { i18nPlugin } from '@embedpdf/react/i18n';
import type { interactionPlugin } from '@embedpdf/react/interaction';
import type { measurementPlugin } from '@embedpdf/react/measurement';
import type { redactionPlugin } from '@embedpdf/react/redaction';
import type { renderPlugin } from '@embedpdf/react/render';
import type { searchPlugin } from '@embedpdf/react/search';
import type { selectionPlugin } from '@embedpdf/react/selection';
import type { signaturePlugin } from '@embedpdf/react/signature';
import type { stagePlugin } from '@embedpdf/react/stage';
import type { stampPlugin } from '@embedpdf/react/stamp';
import { VIEWER_PLUGINS, type PluginName } from './handle';

/** What a plugin factory takes, or `never` for a factory that takes nothing. */
type ConfigOf<Factory extends (...args: never[]) => unknown> =
  Parameters<Factory> extends [] ? never : NonNullable<Parameters<Factory>[0]>;

/** What the viewer adds to the stamp plugin's settings, for its own panel and toolbar. Read once. */
export interface ViewerStampSettings {
  /**
   * Where the standard stamps come from: `true`, the copy that ships inside your build (a lazy
   * chunk, loaded when the stamps panel first opens); a URL with a `{locale}` slot, used exactly
   * as given; `false`, none and no request. Default `true`.
   */
  readonly standard?: boolean | string;
  /**
   * Stamps shown as buttons in the Insert toolbar, each as `library:name`: `standard` is the
   * standard stamps (`'standard:Approved'`), any other library goes by its id. Default none.
   */
  readonly quick?: readonly string[];
  /** The kinds of library the stamps panel lists. Default `['stamps']`. */
  readonly sidebar?: readonly string[];
}

/**
 * A font for typed signatures: its TrueType or OpenType file, from `url` or as `data`, read the
 * first time someone types a mark in it, and registered by the stamp plugin on the engine the
 * mark is written on.
 */
export interface SignatureFont {
  /** What a typed mark's `fontFamily` names it by. */
  readonly key: string;
  /** What the font picker shows. */
  readonly label: string;
  /** Where the file comes from (same-origin or CORS-enabled). */
  readonly url?: string;
  /** The file's bytes, in place of `url`. */
  readonly data?: Uint8Array | ArrayBuffer;
}

/** What the viewer adds to the signature plugin's settings, for its own panel and dialogs. Read once. */
export interface ViewerSignatureSettings {
  /** Which marks people keep. Default both. */
  readonly kinds?: readonly ('signature' | 'initials')[];
  /** Fonts for typed signatures, in the order the maker offers them. Default three handwriting fonts. */
  readonly fonts?: readonly SignatureFont[];
  /** `'one'`: a single person per browser, so no new person once one exists. Default `'many'`. */
  readonly libraries?: 'one' | 'many';
}

const VIEWER_STAMP_KEYS = ['standard', 'quick', 'sidebar'] as const;
const VIEWER_SIGNATURE_KEYS = ['kinds', 'fonts', 'libraries'] as const;

/** The settings each built-in plugin takes in `plugins`: what its factory takes. */
interface BuiltInSettings {
  readonly stage: Omit<ConfigOf<typeof stagePlugin>, 'id' | 'token'>;
  readonly thumbnails: Omit<ConfigOf<typeof stagePlugin>, 'id' | 'token'>;
  readonly render: ConfigOf<typeof renderPlugin>;
  readonly link: never;
  readonly selection: ConfigOf<typeof selectionPlugin>;
  readonly search: ConfigOf<typeof searchPlugin>;
  readonly annotation: ConfigOf<typeof annotationPlugin>;
  readonly stamp: ConfigOf<typeof stampPlugin> & ViewerStampSettings;
  readonly measurement: ConfigOf<typeof measurementPlugin>;
  readonly redaction: ConfigOf<typeof redactionPlugin>;
  readonly form: ConfigOf<typeof formPlugin>;
  readonly signature: ConfigOf<typeof signaturePlugin> & ViewerSignatureSettings;
  readonly pageEdit: never;
  readonly metadata: never;
  readonly fonts: never;
  readonly outline: never;
  readonly attachment: never;
  readonly actions: ConfigOf<typeof actionsPlugin>;
  readonly documents: never;
  readonly interaction: ConfigOf<typeof interactionPlugin>;
  readonly commands: ConfigOf<typeof commandsPlugin>;
  readonly shell: never;
  readonly i18n: ConfigOf<typeof i18nPlugin>;
}

/** A built-in plugin's settings, as its page in the headless docs lists them. */
export type PluginSettings<Name extends PluginName> = BuiltInSettings[Name];

/**
 * The `plugins` config: a built-in plugin's settings under its name (`stage: { spread: 'odd' }`),
 * and a plugin of your own as its definition under a name of your choice
 * (`analytics: analyticsPlugin()`), which `viewer.get('analytics')` then finds.
 */
export type ViewerPluginsConfig = {
  readonly [Name in PluginName]?: PluginSettings<Name>;
} & {
  readonly [name: string]: object | undefined;
};

/** The built-in plugins that take no settings. */
const WITHOUT_SETTINGS: ReadonlySet<string> = new Set<PluginName>([
  'link',
  'pageEdit',
  'metadata',
  'fonts',
  'outline',
  'attachment',
  'documents',
  'shell',
]);

const isBuiltIn = (name: string): name is PluginName =>
  Object.prototype.hasOwnProperty.call(VIEWER_PLUGINS, name);

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

/** Whether a value is a plugin definition: what a plugin factory such as `searchPlugin()` returns. */
export function isPluginDefinition(value: unknown): value is AnyPlugin {
  if (!isObject(value)) return false;
  const { id, create } = value as { readonly id?: unknown; readonly create?: unknown };
  return typeof id === 'string' && typeof create === 'function';
}

/** A plugin of your own from `plugins`, and the name `viewer.get()` finds it by. */
export interface OwnPlugin {
  readonly name: string;
  readonly plugin: AnyPlugin;
}

/** A built-in plugin's own settings: what its factory takes, without the viewer's. */
export type OwnSettings<Name extends PluginName> = Name extends 'stamp'
  ? Omit<PluginSettings<'stamp'>, keyof ViewerStampSettings>
  : Name extends 'signature'
    ? Omit<PluginSettings<'signature'>, keyof ViewerSignatureSettings>
    : PluginSettings<Name>;

/** What the viewer takes from `plugins`. */
export interface PluginsConfigRead {
  /** The built-ins' own settings, each an object. */
  readonly settings: { readonly [Name in PluginName]?: OwnSettings<Name> };
  /** What the viewer adds to two plugins' settings, from the same objects. */
  readonly viewer: {
    readonly stamp: ViewerStampSettings;
    readonly signature: ViewerSignatureSettings;
  };
  /** The plugins of your own, in the order the config names them. */
  readonly own: readonly OwnPlugin[];
  /** What was left out, and why, one sentence each. */
  readonly problems: readonly string[];
}

/** Read `plugins`: the built-ins' settings, the plugins of your own, and what's wrong. */
export function readPluginsConfig(plugins: ViewerPluginsConfig | undefined): PluginsConfigRead {
  const settings: Record<string, object> = {};
  const own: OwnPlugin[] = [];
  const problems: string[] = [];
  for (const [name, value] of Object.entries(plugins ?? {})) {
    if (value === undefined) continue;
    if (!isBuiltIn(name)) {
      if (isPluginDefinition(value)) own.push({ name, plugin: value });
      else {
        problems.push(
          `"${name}" is not one of the viewer's plugins, and not a plugin definition` +
            didYouMean(name, Object.keys(VIEWER_PLUGINS)),
        );
      }
    } else if (isPluginDefinition(value)) {
      problems.push(
        `"${name}" is the viewer's own ${name} plugin: give it settings, or give your plugin ` +
          'a name of its own',
      );
    } else if (WITHOUT_SETTINGS.has(name)) {
      problems.push(`the ${name} plugin takes no settings`);
    } else if (!isObject(value) || Array.isArray(value)) {
      problems.push(`the ${name} plugin's settings are an object`);
    } else {
      settings[name] = value;
    }
  }
  const viewer = {
    stamp: takeViewerSettings<ViewerStampSettings>(settings, 'stamp', VIEWER_STAMP_KEYS),
    signature: takeViewerSettings<ViewerSignatureSettings>(
      settings,
      'signature',
      VIEWER_SIGNATURE_KEYS,
    ),
  };
  return { settings: settings as PluginsConfigRead['settings'], viewer, own, problems };
}

/** Take the viewer's own `keys` out of plugin `name`'s settings in `settings`, and return them. */
function takeViewerSettings<Viewer extends object>(
  settings: Record<string, object>,
  name: PluginName,
  keys: readonly (keyof Viewer & string)[],
): Viewer {
  const given = settings[name] as Readonly<Record<string, unknown>> | undefined;
  if (!given) return {} as Viewer;
  const viewer: Record<string, unknown> = {};
  const own: Record<string, unknown> = { ...given };
  for (const key of keys) {
    if (own[key] !== undefined) viewer[key] = own[key];
    delete own[key];
  }
  settings[name] = own;
  return viewer as Viewer;
}

/** A plugin's settings: the app's, from `plugins`, over the viewer's own for that plugin. */
export function settingsOver<Settings extends object>(
  viewerSettings: Settings,
  settings: Settings | undefined,
): Settings {
  return mergeSettings(viewerSettings, settings as DeepPartial<Settings> | undefined);
}
