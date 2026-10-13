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
import type {
  CapabilityToken,
  Engine,
  EngineFactory,
  Identity,
  InitialDocument,
} from '@embedpdf/react/runtime';
import { stagePlugin } from '@embedpdf/react/stage';
import { renderPlugin } from '@embedpdf/react/render';
import { pageEditPlugin } from '@embedpdf/react/page-edit';
import { metadataPlugin } from '@embedpdf/react/metadata';
import { feedbackPlugin, interactionPlugin, vibrationFeedback } from '@embedpdf/react/interaction';
import { selectionPlugin } from '@embedpdf/react/selection';
import { AnnotationToken, annotationPlugin } from '@embedpdf/react/annotation';
import { stampPlugin } from '@embedpdf/react/stamp';
import { measurementPlugin } from '@embedpdf/react/measurement';
import { redactionPlugin } from '@embedpdf/react/redaction';
import { actionsPlugin } from '@embedpdf/react/actions';
import { FormToken, formPlugin } from '@embedpdf/react/form';
import { signaturePlugin } from '@embedpdf/react/signature';
import { linkPlugin } from '@embedpdf/react/link';
import { searchPlugin } from '@embedpdf/react/search';
import { I18nToken, i18nPlugin, useT } from '@embedpdf/react/i18n';
import type { TranslationDictionary } from '@embedpdf/react/i18n';
import { CommandsToken, commandsPlugin } from '@embedpdf/react/commands';
import type { NotAllowedMode } from '@embedpdf/react/commands';
import { historyPlugin } from '@embedpdf/react/history';
import { shellPlugin } from '@embedpdf/react/shell';
import type { LayoutOption } from '@embedpdf/core-ui';
import { ThumbsStageToken } from './config/stage';
import { defaultCommands, toolCommandsFor } from './config/commands';
import { resolveViewerCommands, type CommandDef } from './config/viewer-commands';
import { localeCodeOf, localesOf } from './locales';
import {
  ViewerConfigProvider,
  type PanelResizeEvent,
  type ResolvedViewerConfig,
  type ViewerFont,
} from './config-context';
import {
  bothAllow,
  byHandSettingsOf,
  disabledSettingsOf,
  sameByHand,
  type ByHandSettings,
  type DisabledSettings,
  type Feature,
  type ReadOnlyExceptions,
} from './features';
import {
  VIEWER_PLUGINS,
  createViewerSlot,
  type PluginTokens,
  type Viewer,
  type ViewerSlot,
} from './handle';
import {
  readPluginsConfig,
  settingsOver,
  type PluginSettings,
  type PluginsConfigRead,
  type ViewerPluginsConfig,
} from './plugin-settings';
import { hasIcon, type IconDef } from './ui/icons';
import { isMacPlatform } from '@embedpdf/web';
import { ThemeProvider, themeConfigOf, type ThemeConfig, type ThemePreference } from './ui/theme';
import { Shell } from './Shell';
import type { PlacedComponents } from './ui/placed-components';
import { SlottedEdgesProvider, createSlottedEdges } from './ui/slotted-edges';

/**
 * The customization surface — identical in the vanilla snippet and every
 * framework wrapper. See README.md for the ladder this implements.
 */
export interface ViewerCustomization {
  /**
   * Your commands, beside the built-in ones. One with a built-in id changes that one, field by
   * field: what it leaves out stays. A shortcut of yours wins over a built-in one with the same
   * keys.
   */
  commands?: readonly CommandDef[];
  /** Your icons by name: 24×24 path data. One with a built-in icon's name replaces it. */
  icons?: Readonly<Record<string, IconDef>>;
  /**
   * Words by language code, over the viewer's own: a built-in button's label under its command's
   * id (`'document:download'`), your own keys (`labelKey`, `titleKey`), dotted keys expanded. A
   * code the viewer has no language for becomes one, falling back to English, and reads right to
   * left when its code's script does (`fa`, `ur`).
   */
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
  /**
   * Each plugin's settings, by the plugin's name, as its page in the headless docs lists them
   * (`stage: { spread: 'odd' }`), over the viewer's own; and a plugin of your own as its
   * definition (`analytics: analyticsPlugin()`), which `viewer.get('analytics')` then finds.
   * Where the viewer's own keys set a plugin's settings too, both count and each only takes
   * away: the plugin's `disabledCategories` and `disabledCommands` add to what `disable` and
   * `readOnly` turn off, and its `editable` and `fillable` keep only what both allow. A list of
   * definitions (`annotation.tools`, `commands.commands`, `i18n.locales`) adds to the viewer's.
   * The language is `locale`'s, and `notAllowed`, when given, wins over the plugin's. `stamp`
   * and `signature` also take settings only the viewer has: the standard and quick stamps, and
   * which marks people keep and their fonts. Read once.
   */
  plugins?: ViewerPluginsConfig;
  /** Light/dark preference (string shorthand), or the full theme config: the
   *  accent and the other tokens. Tokens are applied by the delivery (the
   *  custom element adopts them into its shadow root); direct
   *  consumers of this package set the `--epdf-*` variables in their own CSS
   *  instead. Follows its prop. */
  theme?: ThemePreference | ThemeConfig;
  /**
   * Called with the `viewer` once it's live, before any document has opened: capabilities
   * resolve from then on, and document-scoped calls wait for their document. Read once.
   */
  onReady?: (viewer: Viewer) => void;
  /**
   * Called with the active document's id whenever it changes: the first document that opens,
   * a switch to another tab, and `null` once the last one closes. Read once.
   */
  onDocumentChange?: (documentId: string | null) => void;
  /**
   * Called when the user has resized a panel, with its id and new width in px: once a drag of
   * its edge ends, and on each arrow key there. Keep the width to start the panel at it next
   * time (`layout.panel(id, { width: { initial } })`). Read once.
   */
  onPanelResize?: (event: PanelResizeEvent) => void;
}

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
  /**
   * The viewer's own components placed in the page (`<epdf-button>`, `<epdf-menu>`), which the
   * viewer draws — a delivery concern: the custom element passes the ones inside it.
   */
  components?: PlacedComponents;
  /**
   * Fonts beyond the standard 14 for the engine (a delivery's `engine.fonts`): each is read
   * once, registered on a local engine and mounted for the live text editor, and the style
   * panel offers it. A cloud engine's fonts are its server's, so none are offered there.
   */
  fonts?: readonly ViewerFont[];
}

/**
 * Inside <HeadlessViewer>: reports the live kernel's `viewer` (the one your commands get too),
 * then the active document: the one already active (the initial documents open with the
 * kernel, a delivery's own in `onReady`), and every change after it. The `viewer` is done when
 * this unmounts, with the kernel it reaches: its listeners stop before the documents close.
 */
function HandleBridge({
  slot,
  onReady,
  onDocumentChange,
}: Pick<ViewerCustomization, 'onReady' | 'onDocumentChange'> & { slot: ViewerSlot }) {
  const kernel = useKernel();
  // Before the first paint, so what the delivery opens on arrival (the element's `src`) is a
  // tab by the time the shell first shows.
  useLayoutEffect(() => {
    const viewer = slot.attach(kernel);
    onReady?.(viewer);
    if (onDocumentChange) {
      viewer.watch(
        () => viewer.documents.getActiveId(),
        (documentId) => onDocumentChange(documentId),
      );
      const active = viewer.documents.getActiveId();
      if (active !== null) onDocumentChange(active);
    }
    return () => slot.release(kernel);
    // Init-only like everything else: re-fires only if the kernel changes
    // (a remount), never because a callback prop's identity churned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kernel]);
  return null;
}

const sameList = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((name, index) => name === right[index]);

/**
 * What `disable` and `readOnly` turn off, with what the app's `plugins` settings turn off too:
 * each only takes away.
 */
function turnedOffOf(
  disable: ViewerCustomization['disable'],
  readOnly: ViewerCustomization['readOnly'],
  settings: PluginsConfigRead['settings'],
): { readonly disabled: DisabledSettings; readonly byHand: ByHandSettings } {
  const disabled = disabledSettingsOf(disable, readOnly);
  const byHand = byHandSettingsOf(disable, readOnly);
  const union = (viewers: readonly string[], apps: readonly string[] | undefined) =>
    apps?.length ? [...new Set([...viewers, ...apps])] : viewers;
  return {
    disabled: {
      disabledCategories: union(disabled.disabledCategories, settings.commands?.disabledCategories),
      disabledCommands: union(disabled.disabledCommands, settings.commands?.disabledCommands),
    },
    byHand: {
      editable: bothAllow(byHand.editable, settings.annotation?.editable ?? true),
      fillable: bothAllow(byHand.fillable, settings.form?.fillable ?? true),
    },
  };
}

/**
 * Inside <HeadlessViewer>: the props that follow their value while the viewer runs. `registered`
 * is what the plugins were registered with, when the props were first read; a value that differs
 * from the last one goes to the plugin that owns it, so a theme change never undoes what the
 * app's code turned off. `settings` are the app's `plugins` settings, which still count.
 */
function FollowProps({
  registered,
  settings,
  locale,
  disable,
  readOnly,
}: {
  registered: {
    readonly locale: string;
    readonly disabled: DisabledSettings;
    readonly byHand: ByHandSettings;
  };
  settings: PluginsConfigRead['settings'];
  locale: string;
  disable: ViewerCustomization['disable'];
  readOnly: ViewerCustomization['readOnly'];
}) {
  const kernel = useKernel();
  // The kernel starts after the first render, so a prop may have changed before this mounts.
  const applied = useRef(registered);
  // In the render that brought the change, so the plugin has it when the prop's setter returns.
  useLayoutEffect(() => {
    const { disabled, byHand } = turnedOffOf(disable, readOnly, settings);
    const previous = applied.current;
    applied.current = { locale, disabled, byHand };
    // What a turned-off feature made stays in the document, frozen: no one changes it by hand.
    if (!sameByHand(previous.byHand.editable, byHand.editable)) {
      kernel.settingsOf(AnnotationToken).updateSettings({ editable: byHand.editable });
    }
    if (!sameByHand(previous.byHand.fillable, byHand.fillable)) {
      kernel.settingsOf(FormToken).updateSettings({ fillable: byHand.fillable });
    }
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
  plugins: pluginsConfig,
  fonts,
  theme,
  themeTarget,
  components,
  onReady,
  onDocumentChange,
  onPanelResize,
}: FullViewerProps) {
  // Which bar each slotted toolbar item is in, for the viewer's own components inside it.
  const [slottedEdges] = useState(createSlottedEdges);
  // Customization is init-only, like the Viewer's own engine/plugins
  // contract: the whole config resolves once from the mount-time props, so
  // inline literals — the idiomatic way to pass it — never churn plugin
  // identities. Later prop changes are ignored, except the ones FollowProps
  // and ThemeProvider follow.
  const [resolved] = useState(() => {
    // ── languages: the app's strings in the viewer's, and languages of its own ──
    const { locales, loaders, codes } = localesOf(strings);

    // ── plugins: the app's settings for the built-ins, and its own plugins ──
    const pluginsRead = readPluginsConfig(pluginsConfig);
    const tokens: Record<string, CapabilityToken<unknown>> = { ...VIEWER_PLUGINS };
    for (const { name, plugin } of pluginsRead.own) if (plugin.token) tokens[name] = plugin.token;

    // ── commands: yours over the built-in ones, a command for each tool of yours ──
    // The kernel's `viewer`, made when it starts: what `onReady` and your commands get.
    const slot = createViewerSlot(tokens as PluginTokens);
    const builtInIds = new Set(defaultCommands.map((command) => command.id));
    const builtIns = [
      ...defaultCommands,
      ...toolCommandsFor(pluginsRead.settings.annotation?.tools ?? [], (id) => builtInIds.has(id)),
    ];
    const viewerCommands = resolveViewerCommands(
      builtIns,
      commands ?? [],
      { plugins: tokens as PluginTokens, viewer: slot.current },
      { isMac: isMacPlatform() },
    );

    return {
      slot,
      viewerCommands,
      // Structure: resolved at the viewer's env by the shell's layout root.
      layout,
      icons: icons ?? {},
      stamp: pluginsRead.viewer.stamp,
      signature: pluginsRead.viewer.signature,
      fonts: fonts ?? [],
      onPanelResize,
      i18n: { locales, loaders, codes, initial: localeCodeOf(locale, codes) },
      plugins: pluginsRead,
      tokens: tokens as PluginTokens,
      ...turnedOffOf(disable, readOnly, pluginsRead.settings),
    };
  });

  // Dev guardrail: every icon a command names must resolve. Warnings name the
  // exact id (README promise); the layout's ids are checked where it resolves.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    for (const command of resolved.viewerCommands.commands) {
      if (command.icon && !hasIcon(command.icon) && !(command.icon in resolved.icons)) {
        console.warn(`[embedpdf] command "${command.id}": unknown icon "${command.icon}"`);
      }
    }
  }, [resolved]);

  // In every build, as the layout's: a misspelled plugin name quietly loses its settings.
  useEffect(() => {
    for (const problem of resolved.plugins.problems) console.warn(`[embedpdf] plugins: ${problem}`);
  }, [resolved]);

  // The app's settings for each built-in plugin, from `plugins`.
  const { settings } = resolved.plugins;
  const [plugins] = useState(() => [
    // The main lens (tools engage via interactionPlugin below).
    stagePlugin(settingsOver<PluginSettings<'stage'>>({ layout: 'vertical' }, settings.stage)),
    // Thumbnail lens over the same document (`thumbnails` in `plugins`): a grid at a
    // fixed small zoom, its own camera, wrapping into as many columns as the panel's
    // width fits. Click a thumb to navigate the main lens; the sidebar follows the
    // main view (see ui/panels ThumbnailList).
    // Each setting the app gives replaces the viewer's whole, as a Stage's own
    // `updateSettings()` does: `zoom: { level: 0.2 }` is that zoom, not a mix.
    stagePlugin({
      layout: 'grid',
      columns: 'auto', // one column at the default width; more as the panel widens
      sizing: 'uniform', // equalize pages so the pixel target hits every thumb
      zoom: { pageWidth: 150 }, // thumbs are 150 screen px wide — for any document
      padding: 12,
      gap: { px: 16 }, // UI-stable spacing between thumbs
      pageFrame: { top: 0, right: 0, bottom: 20, left: 0 }, // reserved label band (screen px)
      fitAlign: { x: 'center', y: 'start' }, // few pages? thumbs hug the top
      scrollBehavior: 'instant',
      interaction: false, // click-to-navigate: a drag never reaches the document's tools
      zoomGestures: false, // a fixed-magnification rail: Cmd+wheel and pinch scroll it
      ...settings.thumbnails,
      id: 'stage-thumbs',
      token: ThumbsStageToken,
    }),
    renderPlugin(settings.render),
    pageEditPlugin(),
    // The document's title, author and your own fields, read the first time something asks
    // (`viewer.get('metadata').ensureLoaded()`, `useMetadataState()`), never as a document opens.
    metadataPlugin(),
    interactionPlugin(settings.interaction),
    // Platform haptics, default-on: the Vibration API where it exists
    // (Android), a safe silent no-op elsewhere — iOS Safari included, until
    // Apple ships a haptics API. Native shells swap in their own provider
    // (`wkFeedback`) instead.
    feedbackPlugin({ provider: vibrationFeedback }),
    selectionPlugin(settings.selection),
    // The arrow tool is a `line` preset — same subtype, an arrowhead default. This is
    // the whole integration for a new tool: one `tools` entry + a command/toolbar
    // slot (see config/commands.ts + config/chrome.ts).
    annotationPlugin({
      ...settings.annotation,
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
        // The app's own after the viewer's: one with the same id changes it.
        ...(settings.annotation?.tools ?? []),
      ],
      // What a turned-off feature made stays, but no one changes it by hand.
      editable: resolved.byHand.editable,
    }),
    // Undo and redo of what the user changes, one history per document.
    historyPlugin(),
    // Stamp libraries (workspace-scoped): named reusable assets — the built-in
    // set plus any PDF the user imports, each page one vector stamp. The
    // stamps sidebar is the picker; placement rides annotation's armed stamp.
    // Libraries open on a local engine: the viewer's own unless the host
    // names one (`assetEngine`; a cloud viewer has to).
    stampPlugin(settings.stamp),
    // The action engine: /A and /AA trees dispatch through one policy-gated
    // executor spine, and the JavaScript switch lives here (the per-document
    // ScriptHost realm; form's K/V/C/F pipeline rides its transaction port,
    // stamp's dynamic templates evaluate in detached realms it mints).
    // Scripts ask who the user is (`identity.name`): the document's user, from
    // the viewer's identity or the token.
    actionsPlugin(
      settingsOver<PluginSettings<'actions'>>({ javascript: { enabled: true } }, settings.actions),
    ),
    // Forms: fillable under the default pointer/pan (widgets render as fill
    // controls), editable under the Form tab's 'form-edit' + palette tools.
    formPlugin({ ...settings.form, fillable: resolved.byHand.fillable }),
    // Signatures: the act — a mark (a signatures-library asset) dropped on a
    // signature field signs it through the configured key, or is drawn in
    // without sealing when there is none. Marks themselves are the stamp
    // plugin's; the panel lists libraries of kind 'signatures'.
    signaturePlugin(settings.signature),
    // Links: navigable under the default pointer/pan ('link-nav'), editable
    // under the link tool — the annotation plane then owns them (select, move,
    // retarget via the style panel's Link control).
    linkPlugin(),
    // Redaction: marking is the annotation plane's composed `redact` tool; this
    // plugin adds the pending-queue view + the destructive apply.
    redactionPlugin(settings.redaction),
    measurementPlugin(settings.measurement),
    searchPlugin(settings.search),
    i18nPlugin({
      fallbackLocale: 'en',
      ...settings.i18n,
      locale: resolved.i18n.initial,
      locales: [...resolved.i18n.locales, ...(settings.i18n?.locales ?? [])],
      loaders: { ...resolved.i18n.loaders, ...settings.i18n?.loaders },
    }),
    commandsPlugin({
      ...settings.commands,
      commands: [...resolved.viewerCommands.commands, ...(settings.commands?.commands ?? [])],
      ...resolved.disabled,
      ...(notAllowed ? { notAllowed } : {}),
    }),
    shellPlugin(),
    // The app's own plugins, under the names `viewer.get()` finds them by.
    ...resolved.plugins.own.map(({ plugin }) => plugin),
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
        onReady={(kernel) => void resolved.slot.attach(kernel)}
      >
        <ViewerConfigProvider value={config}>
          <FollowProps
            registered={{
              locale: resolved.i18n.initial,
              disabled: resolved.disabled,
              byHand: resolved.byHand,
            }}
            settings={settings}
            locale={localeCodeOf(locale, resolved.i18n.codes)}
            disable={disable}
            readOnly={readOnly}
          />
          <HandleBridge
            slot={resolved.slot}
            onReady={onReady}
            onDocumentChange={onDocumentChange}
          />
          <SlottedEdgesProvider value={slottedEdges}>
            <Shell components={components} />
          </SlottedEdgesProvider>
        </ViewerConfigProvider>
      </HeadlessViewer>
    </ThemeProvider>
  );
}
