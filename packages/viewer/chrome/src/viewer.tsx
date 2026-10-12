/**
 * The full viewer, as a component — and the customization contract. The
 * `ViewerCustomization` surface here is the exact shape that later powers
 * `EmbedPDF.init({...})` and every framework wrapper, because all of it is
 * plain data (see README.md).
 *
 * Two semantics, on purpose:
 *  - registries (commands / icons / strings) merge additively over the
 *    defaults by id; a colliding id overrides.
 *  - structure (layout) is an owned value: the default, edits of it (a
 *    function of the default and the viewer's env), or the host's own
 *    layout — never merged.
 *
 * The engine stays a prop — choosing local-wasm vs cloud is the host's
 * decision, and each delivery wires its own. The chrome — toolbars,
 * translations, theme — renders at t≈0; only the pages wait on the engine.
 * Customization is mount-time, except `theme`, `locale`, `disable` and
 * `readOnly`, which follow their props (see {@link FollowProps}); changing any
 * other prop on a mounted viewer does not rebuild the workspace.
 */
// One import line per feature: each subpath carries the
// plugin and its UI; delete a line and the feature leaves the bundle.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Viewer as HeadlessViewer, useKernel } from '@embedpdf/react/runtime';
import type { Engine, EngineFactory, Identity, InitialDocument } from '@embedpdf/react/runtime';
import { stagePlugin } from '@embedpdf/react/stage';
import { renderPlugin } from '@embedpdf/react/render';
import { pageEditPlugin } from '@embedpdf/react/page-edit';
import { feedbackPlugin, interactionPlugin, vibrationFeedback } from '@embedpdf/react/interaction';
import { selectionPlugin } from '@embedpdf/react/selection';
import { annotationPlugin } from '@embedpdf/react/annotation';
import { stampPlugin } from '@embedpdf/react/stamp';
import { measurementPlugin } from '@embedpdf/react/measurement';
import { redactionPlugin } from '@embedpdf/react/redaction';
import { actionsPlugin } from '@embedpdf/react/actions';
import { formPlugin } from '@embedpdf/react/form';
import { signaturePlugin } from '@embedpdf/react/signature';
import { linkPlugin } from '@embedpdf/react/link';
import { searchPlugin } from '@embedpdf/react/search';
import { I18nToken, i18nPlugin, negotiateLocale, useT } from '@embedpdf/react/i18n';
import type { Locale, TranslationDictionary } from '@embedpdf/react/i18n';
import { CommandsToken, commandsPlugin } from '@embedpdf/react/commands';
import type { CommandDef, NotAllowedMode } from '@embedpdf/react/commands';
import { historyPlugin } from '@embedpdf/react/history';
import { shellPlugin } from '@embedpdf/react/shell';
import type { LayoutOption } from '@embedpdf/core-ui';
import { EPDF_VARIABLES } from '@embedpdf/web';
import { ThumbsStageToken } from './config/stage';
import { defaultCommands } from './config/commands';
import { en } from './locales/en';
import {
  ViewerConfigProvider,
  type ResolvedViewerConfig,
  type StampsCustomization,
} from './config-context';
import type { AnnotationsCustomization, SignaturesCustomization } from './config-context';
import {
  disabledSettingsOf,
  type DisabledSettings,
  type Feature,
  type ReadOnlyExceptions,
} from './features';
import { VIEWER_PLUGINS, createViewer, type Viewer } from './handle';
import { ICON_PATHS, type IconDef } from './ui/icons';
import { ThemeProvider, type ThemePreference } from './ui/theme';
import { Shell } from './Shell';

/** Lazy built-in packs — a strings override for one of these wraps its loader. */
const BUILTIN_LOADERS: Record<string, () => Promise<Locale>> = {
  es: () => import('./locales/es').then((module) => module.es),
};

/**
 * The language a `locale` value shows, among the viewer's: the browser's languages for
 * `'auto'`, else the closest to the one asked for (`'es-MX'` shows `'es'`), else English.
 */
const localeCodeOf = (locale: string, codes: readonly string[]): string =>
  negotiateLocale(
    codes,
    locale !== 'auto' ? [locale] : typeof navigator !== 'undefined' ? navigator.languages : [],
  ) ?? 'en';

const isDict = (value: unknown): value is TranslationDictionary =>
  typeof value === 'object' && value !== null;

/**
 * Deep-merge `over` into `base` (immutably), expanding dotted keys —
 * `{ 'acme.send': 'X' }` and `{ acme: { send: 'X' } }` are the same override.
 */
function mergeTranslations(
  base: TranslationDictionary,
  over: TranslationDictionary,
): TranslationDictionary {
  const out: Record<string, string | TranslationDictionary> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const path = key.split('.');
    let node = out;
    for (let i = 0; i < path.length - 1; i++) {
      const previous = node[path[i]];
      node = (node[path[i]] = isDict(previous) ? { ...previous } : {}) as Record<
        string,
        string | TranslationDictionary
      >;
    }
    const leaf = path[path.length - 1];
    const existing = node[leaf];
    node[leaf] =
      typeof value === 'string'
        ? value
        : mergeTranslations(isDict(existing) ? existing : {}, value);
  }
  return out;
}

const mergeLocale = (pack: Locale, over?: TranslationDictionary): Locale =>
  over ? { ...pack, translations: mergeTranslations(pack.translations, over) } : pack;

/**
 * The customization surface — identical in the vanilla snippet and every
 * framework wrapper. See README.md for the ladder this implements.
 */
export interface ViewerCustomization {
  /** Additive over the default vocabulary; a colliding id overrides. */
  commands?: readonly CommandDef[];
  /** Additive 24×24 stroke icons by name; a colliding name overrides. */
  icons?: Readonly<Record<string, IconDef>>;
  /** Per-locale translation overrides/additions; dotted keys expand. A code
   *  with no built-in pack becomes a new locale (falls back to English). */
  strings?: Readonly<Record<string, TranslationDictionary>>;
  /** 'auto' (default) negotiates from the browser languages. Follows its prop. */
  locale?: 'auto' | (string & {});
  /**
   * What this viewer doesn't have, everywhere at once: features (`'annotations'`), their parts
   * (`'annotations.highlight'`) and single commands (`'tool:highlight'`: a name with a colon).
   * Follows its prop.
   */
  disable?: readonly (Feature | (string & {}))[];
  /**
   * Every feature that changes the document off, or all of them but `except`, on top of
   * `disable`. Only the interface: plugins keep working for your code. Follows its prop.
   */
  readOnly?: boolean | ReadOnlyExceptions;
  /**
   * What the user may do: the permissions the engine checks on every call, from a button or
   * from code. Left out, they may do everything. Documents opened after a change use the new one.
   */
  scope?: readonly string[];
  /** Who the user is: the author of what they write. */
  identity?: Identity;
  /** What the scope doesn't allow: `'hide'` it (default), or `'disable'` it with the reason. */
  notAllowed?: NotAllowedMode;
  /**
   * Where every toolbar, button, menu and panel goes: a layout of your own, or a function that
   * gets the default layout and the viewer's env (`size`, `width`, `touch`, `dir`) and returns
   * yours. The function runs again when the env changes. Never merged.
   */
  layout?: LayoutOption;
  /** Stamps. `defaultLibrary` is the sidebar's built-in library: `false` for
   *  none (air-gapped, no request), or a URL template with a `{locale}` slot
   *  for a self-hosted copy of `@embedpdf/default-stamps`. Default: the copy
   *  that ships with the viewer, as a lazy chunk of your own build — no CDN.
   *  `assetEngine` is the local engine libraries open in (see
   *  {@link StampsCustomization}). */
  stamps?: StampsCustomization;
  /** Digital signatures: the key, trust anchors, the mode (sign / visual /
   *  ask), which marks a person keeps, and script faces for typed marks. With
   *  no key, a mark placed on a field is drawn in without sealing. */
  signatures?: SignaturesCustomization;
  /** Annotations: fonts the free-text style panel offers beyond the standard
   *  14 — fetched, registered on the engine and mounted for the live editor. */
  annotations?: AnnotationsCustomization;
  /** Light/dark preference (string shorthand), or the full theme config with
   *  token overrides. Tokens are applied by the delivery (the custom element
   *  adopts them into its shadow root); direct consumers of this package set
   *  the variables in their own CSS instead. Follows its prop. */
  theme?: ThemePreference | ThemeConfig;
}

/**
 * Token overrides, by variable name without its prefix: an EmbedPDF theming
 * variable (`accent` sets `--epdf-accent`, which the pages and the chrome both
 * follow), else one of the chrome's own `--ep-*` tokens (`surface`, `fg`, …).
 */
export type ThemeTokens = Readonly<Record<string, string>>;

/** The CSS variable a theme token sets: see {@link ThemeTokens}. */
export const themeTokenProperty = (name: string): string =>
  Object.prototype.hasOwnProperty.call(EPDF_VARIABLES, name) ? `--epdf-${name}` : `--ep-${name}`;

export interface ThemeConfig {
  /** 'system' (default) follows the OS. */
  preference?: ThemePreference;
  /** Applied in both modes (a later sheet: wins over the defaults). */
  tokens?: ThemeTokens;
  /** Dark-mode-only overrides, applied over `tokens`. */
  dark?: ThemeTokens;
}

/** Normalize the shorthand — deliveries use this to read one shape. */
export const themeConfigOf = (theme: ThemePreference | ThemeConfig | undefined): ThemeConfig =>
  typeof theme === 'string' ? { preference: theme } : (theme ?? {});

export interface FullViewerProps extends ViewerCustomization {
  /** Instance (borrowed) or thunk (viewer-owned) — the Viewer's own contract. */
  engine: Engine | EngineFactory;
  /** Documents to open at mount; more arrive via the tab bar's open button. */
  initialDocuments?: InitialDocument[];
  /** Shown while the workspace boots. Default: a translated pulse line. */
  fallback?: ReactNode;
  /** Where the theme's `.dark` class goes — a delivery concern, not user
   *  config: the custom element passes its shadow wrapper so theming never
   *  touches the host page. Default: document.documentElement. */
  themeTarget?: HTMLElement | null;
  /** Called once the workspace kernel is live, with the `viewer` (`el.viewer`
   *  on the custom element, `onReady` on the wrappers). Capabilities resolve
   *  from the moment this fires; document-scoped calls simply await their
   *  document. */
  onViewer?: (viewer: Viewer) => void;
}

/** Inside <HeadlessViewer>: makes the `viewer` from the live kernel, reports it up. */
function HandleBridge({ onViewer }: { onViewer: (viewer: Viewer) => void }) {
  const kernel = useKernel();
  // Before the first paint, so what the delivery opens on arrival (the element's `src`) is a
  // tab by the time the shell first shows.
  useLayoutEffect(() => {
    onViewer(createViewer(kernel, VIEWER_PLUGINS));
    // Init-only like everything else: re-fires only if the kernel changes
    // (a remount), never because the callback prop identity churned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kernel]);
  return null;
}

const sameList = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((name, index) => name === right[index]);

/**
 * Inside <HeadlessViewer>: the props that follow their value while the viewer runs. `registered`
 * is what the plugins were registered with, when the props were first read; a value that differs
 * from the last one goes to the plugin that owns it, so a theme change never undoes what the
 * app's code turned off.
 */
function FollowProps({
  registered,
  locale,
  disable,
  readOnly,
}: {
  registered: { readonly locale: string; readonly disabled: DisabledSettings };
  locale: string;
  disable: ViewerCustomization['disable'];
  readOnly: ViewerCustomization['readOnly'];
}) {
  const kernel = useKernel();
  // The kernel starts after the first render, so a prop may have changed before this mounts.
  const applied = useRef(registered);
  // In the render that brought the change, so the plugin has it when the prop's setter returns.
  useLayoutEffect(() => {
    const disabled = disabledSettingsOf(disable, readOnly);
    const previous = applied.current;
    applied.current = { locale, disabled };
    if (
      !sameList(previous.disabled.disabledCategories, disabled.disabledCategories) ||
      !sameList(previous.disabled.disabledCommands, disabled.disabledCommands)
    ) {
      kernel.capability(CommandsToken).updateSettings(disabled);
    }
    if (previous.locale !== locale) {
      // A newer switch cancels this one, which rejects; the newer one shows.
      kernel
        .capability(I18nToken)
        .setLocale(locale)
        .catch(() => {});
    }
  });
  return null;
}

function Booting() {
  const t = useT();
  return (
    <div className="bg-app text-fg-muted grid h-full place-items-center">
      <div className="animate-pulse text-sm">{t('demo.starting')}</div>
    </div>
  );
}

export function FullViewer({
  engine,
  initialDocuments,
  fallback,
  commands,
  icons,
  strings,
  locale = 'auto',
  disable,
  readOnly,
  scope,
  identity,
  notAllowed,
  layout,
  stamps,
  signatures,
  annotations,
  theme,
  themeTarget,
  onViewer,
}: FullViewerProps) {
  // Customization is init-only, like the Viewer's own engine/plugins
  // contract: the whole config resolves once from the mount-time props, so
  // inline literals — the idiomatic way to pass it — never churn plugin
  // identities. Later prop changes are ignored, except the ones FollowProps
  // and ThemeProvider follow.
  const [resolved] = useState(() => {
    // ── registries: additive, user wins by id ───────────────────────────────
    const byId = new Map(defaultCommands.map((command) => [command.id, command]));
    for (const command of commands ?? []) byId.set(command.id, command);
    const resolvedCommands = [...byId.values()];

    // ── locale packs: overrides merge into built-ins; unknown codes become
    //    new locales that fall back to English ──────────────────────────────
    const overrides = strings ?? {};
    const locales: Locale[] = [mergeLocale(en, overrides.en)];
    const loaders: Record<string, () => Promise<Locale>> = {};
    for (const [code, load] of Object.entries(BUILTIN_LOADERS)) {
      const over = overrides[code];
      loaders[code] = over ? () => load().then((pack) => mergeLocale(pack, over)) : load;
    }
    for (const [code, over] of Object.entries(overrides)) {
      if (code === 'en' || code in BUILTIN_LOADERS) continue;
      locales.push({ code, name: code, translations: mergeTranslations({}, over) });
    }
    const codes = [...new Set(['en', ...Object.keys(BUILTIN_LOADERS), ...Object.keys(overrides)])];

    return {
      commands: resolvedCommands,
      // Structure: resolved at the viewer's env by the shell's layout root.
      layout,
      icons: icons ?? {},
      stamps: stamps ?? {},
      signatures: signatures ?? {},
      annotations: annotations ?? {},
      i18n: { locales, loaders, codes, initial: localeCodeOf(locale, codes) },
      disabled: disabledSettingsOf(disable, readOnly),
    };
  });

  // Dev guardrail: every icon a command names must resolve. Warnings name the
  // exact id (README promise); the layout's ids are checked where it resolves.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    for (const command of resolved.commands) {
      if (command.icon && !(command.icon in ICON_PATHS) && !(command.icon in resolved.icons)) {
        console.warn(`[embedpdf] command "${command.id}": unknown icon "${command.icon}"`);
      }
    }
  }, [resolved]);

  const [plugins] = useState(() => [
    stagePlugin({ layout: 'vertical' }), // main lens (tools engage via interactionPlugin below)
    // Thumbnail lens over the same document: a single-column grid at a fixed small
    // zoom, its own camera. Click a thumb to navigate the main lens; the sidebar
    // follows the main view (see ui/panels ThumbnailList).
    stagePlugin({
      id: 'stage-thumbs',
      token: ThumbsStageToken,
      layout: 'grid',
      columns: 1, // a single-column thumbnail rail
      sizing: 'uniform', // equalize pages so the pixel target hits every thumb
      zoom: { pageWidth: 150 }, // thumbs are 150 screen px wide — for any document
      padding: 12,
      gap: { px: 16 }, // UI-stable spacing between thumbs
      pageFrame: { top: 0, right: 0, bottom: 20, left: 0 }, // reserved label band (screen px)
      fitAlign: { x: 'center', y: 'start' }, // few pages? thumbs hug the top
      scrollBehavior: 'instant',
      interaction: false, // click-to-navigate: a drag never reaches the document's tools
      zoomGestures: false, // a fixed-magnification rail: Cmd+wheel and pinch scroll it
    }),
    renderPlugin(),
    pageEditPlugin(),
    interactionPlugin(),
    // Platform haptics, default-on: the Vibration API where it exists
    // (Android), a safe silent no-op elsewhere — iOS Safari included, until
    // Apple ships a haptics API. Native shells swap in their own provider
    // (`wkFeedback`) instead.
    feedbackPlugin({ provider: vibrationFeedback }),
    selectionPlugin(),
    // The arrow tool is a `line` preset — same subtype, an arrowhead default. This is
    // the whole integration for a new tool: one `tools` entry + a command/toolbar
    // slot (see config/commands.ts + config/chrome.ts).
    annotationPlugin({
      tools: [
        // Shapes and lines show their ghost: what a click places follows the
        // pointer (the arrow inherits the line's).
        { id: 'square', ghost: true },
        { id: 'circle', ghost: true },
        { id: 'line', ghost: true },
        {
          id: 'arrow',
          extends: 'line',
          defaults: { lineEndings: { start: 'none', end: 'open-arrow' } },
        },
        // The Insert tab's Image button: a `stamp` preset whose payload comes
        // from the file-picker port, narrowed to rasters. Click the spot, the
        // dialog opens, the picture lands there. Its own tool id (not `stamp`)
        // keeps it out of the stamp panel's armed state and gives it its own
        // cursor icon.
        {
          id: 'image',
          extends: 'stamp',
          source: { kind: 'prompt', accept: 'image/png,image/jpeg' },
        },
      ],
    }),
    // Undo and redo of what the user changes, one history per document.
    historyPlugin(),
    // Stamp libraries (workspace-scoped): named reusable assets — the built-in
    // set plus any PDF the user imports, each page one vector stamp. The
    // stamps sidebar is the picker; placement rides annotation's armed stamp.
    // Libraries open on a local engine: the viewer's own unless the host
    // names one (a cloud viewer has to).
    stampPlugin(
      resolved.stamps.assetEngine ? { assetEngine: resolved.stamps.assetEngine } : undefined,
    ),
    // The action engine: /A and /AA trees dispatch through one policy-gated
    // executor spine, and the JavaScript switch lives here (the per-document
    // ScriptHost realm; form's K/V/C/F pipeline rides its transaction port,
    // stamp's dynamic templates evaluate in detached realms it mints).
    // Scripts ask who the user is (`identity.name`): the document's user, from
    // the viewer's identity or the token.
    actionsPlugin({ javascript: { enabled: true } }),
    // Forms: fillable under the default pointer/pan (widgets render as fill
    // controls), editable under the Form tab's 'form-edit' + palette tools.
    formPlugin(),
    // Signatures: the act — a mark (a signatures-library asset) dropped on a
    // signature field signs it through the configured key, or is drawn in
    // without sealing when there is none. Marks themselves are the stamp
    // plugin's; the panel lists libraries of kind 'signatures'.
    signaturePlugin({
      mode: resolved.signatures.mode,
      key: resolved.signatures.key,
      trust: resolved.signatures.trust,
      allowCertify: resolved.signatures.allowCertify,
    }),
    // Links: navigable under the default pointer/pan ('link-nav'), editable
    // under the link tool — the annotation plane then owns them (select, move,
    // retarget via the style panel's Link control).
    linkPlugin(),
    // Redaction: marking is the annotation plane's composed `redact` tool; this
    // plugin adds the pending-queue view + the destructive apply.
    redactionPlugin(),
    measurementPlugin(),
    searchPlugin(),
    i18nPlugin({
      locale: resolved.i18n.initial,
      fallbackLocale: 'en',
      locales: resolved.i18n.locales,
      loaders: resolved.i18n.loaders,
    }),
    commandsPlugin({
      commands: resolved.commands,
      ...resolved.disabled,
      ...(notAllowed ? { notAllowed } : {}),
    }),
    shellPlugin(),
  ]);

  // Structural subset of `resolved`, identity-stable across renders.
  const config: ResolvedViewerConfig = resolved;

  return (
    <ThemeProvider preference={themeConfigOf(theme).preference} target={themeTarget}>
      <HeadlessViewer
        engine={engine}
        plugins={plugins}
        initialDocuments={initialDocuments}
        scope={scope}
        identity={identity}
        fallback={fallback ?? <Booting />}
      >
        <ViewerConfigProvider value={config}>
          <FollowProps
            registered={{ locale: resolved.i18n.initial, disabled: resolved.disabled }}
            locale={localeCodeOf(locale, resolved.i18n.codes)}
            disable={disable}
            readOnly={readOnly}
          />
          {onViewer && <HandleBridge onViewer={onViewer} />}
          <Shell />
        </ViewerConfigProvider>
      </HeadlessViewer>
    </ThemeProvider>
  );
}
