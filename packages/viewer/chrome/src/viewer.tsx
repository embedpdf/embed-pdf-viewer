/**
 * The full viewer, as a component — and the customization CONTRACT. The
 * `ViewerCustomization` surface here is the exact shape that later powers
 * `EmbedPDF.init({...})` and every framework wrapper, because all of it is
 * plain data (see README.md).
 *
 * Two semantics, on purpose:
 *  - REGISTRIES (commands / icons / strings) merge ADDITIVELY over the
 *    defaults by id; a colliding id overrides.
 *  - STRUCTURE (chrome) is an owned VALUE: the default, a transform of it,
 *    or the host's own schema — never merged.
 *
 * The engine stays a prop — choosing local-wasm vs cloud is the host's
 * decision, and each delivery wires its own. The chrome —
 * toolbars, translations, theme — renders at t≈0; only the pages wait on
 * the engine. Customization is mount-time (exactly like v2's init config);
 * changing these props on a mounted viewer does not rebuild the workspace.
 */
// One import line per feature: each subpath carries the
// plugin AND its UI; delete a line and the feature leaves the bundle.
import { useEffect, useState, type ReactNode } from 'react';
import { Viewer, useKernel } from '@embedpdf/react/runtime';
import type { Engine, EngineFactory, InitialDocument } from '@embedpdf/react/runtime';
import { stagePlugin } from '@embedpdf/react/stage';
import { renderPlugin } from '@embedpdf/react/render';
import { pageEditPlugin } from '@embedpdf/react/page-edit';
import { feedbackPlugin, interactionPlugin, vibrationFeedback } from '@embedpdf/react/interaction';
import { selectionPlugin } from '@embedpdf/react/selection';
import { annotationPlugin } from '@embedpdf/react/annotation';
import { redactionPlugin } from '@embedpdf/react/redaction';
import { actionsPlugin } from '@embedpdf/react/actions';
import { formPlugin } from '@embedpdf/react/form';
import { linkPlugin } from '@embedpdf/react/link';
import { searchPlugin } from '@embedpdf/react/search';
import { i18nPlugin, negotiateLocale, useT } from '@embedpdf/react/i18n';
import type { Locale, TranslationDictionary } from '@embedpdf/react/i18n';
import { commandsPlugin } from '@embedpdf/react/commands';
import type { CommandDef } from '@embedpdf/react/commands';
import { shellPlugin } from '@embedpdf/react/shell';
import { chromeHelpers, validateChrome } from '@embedpdf/react/toolbar';
import type { ChromeHelpers, ChromeSchema } from '@embedpdf/react/toolbar';
import { ThumbsStageToken } from './config/stage';
import { defaultChrome } from './config/chrome';
import { defaultCommands } from './config/commands';
import { demoToolsPlugin } from './config/demo-tools.plugin';
import { en } from './locales/en';
import { ViewerConfigProvider, type ResolvedViewerConfig } from './config-context';
import { createViewerHandle, type ViewerHandle } from './handle';
import { ICON_PATHS, type IconDef } from './ui/icons';
import { ThemeProvider, type ThemePreference } from './ui/theme';
import { Shell } from './Shell';

/** Lazy built-in packs — a strings override for one of these wraps its loader. */
const BUILTIN_LOADERS: Record<string, () => Promise<Locale>> = {
  es: () => import('./locales/es').then((m) => m.es),
};

const isDict = (v: unknown): v is TranslationDictionary => typeof v === 'object' && v !== null;

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
      const prev = node[path[i]];
      node = (node[path[i]] = isDict(prev) ? { ...prev } : {}) as Record<
        string,
        string | TranslationDictionary
      >;
    }
    const leaf = path[path.length - 1];
    const prev = node[leaf];
    node[leaf] =
      typeof value === 'string' ? value : mergeTranslations(isDict(prev) ? prev : {}, value);
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
  /** ADDITIVE over the default vocabulary; a colliding id overrides. */
  commands?: readonly CommandDef[];
  /** ADDITIVE 24×24 stroke icons by name; a colliding name overrides. */
  icons?: Readonly<Record<string, IconDef>>;
  /** Per-locale translation overrides/additions; dotted keys expand. A code
   *  with no built-in pack becomes a new locale (falls back to English). */
  strings?: Readonly<Record<string, TranslationDictionary>>;
  /** 'auto' (default) negotiates from the browser languages. */
  locale?: 'auto' | (string & {});
  /** Feature gating: a disabled category vanishes from every surface. */
  disabledCategories?: readonly string[];
  /** The structure — a value you OWN: the default (pass nothing), a transform
   *  of it, or your own schema. Never merged. */
  chrome?: ChromeSchema | ((base: ChromeSchema, helpers: ChromeHelpers) => ChromeSchema);
  /** Light/dark preference (string shorthand), or the full theme config with
   *  `--ep-*` token overrides. Tokens are applied by the DELIVERY (the custom
   *  element adopts them into its shadow root); direct consumers of this
   *  package set the `--ep-*` variables in their own CSS instead. */
  theme?: ThemePreference | ThemeConfig;
}

/** Token overrides — names WITHOUT the `--ep-` prefix ('accent', 'surface'…). */
export type ThemeTokens = Readonly<Record<string, string>>;

export interface ThemeConfig {
  /** 'system' (default) follows the OS. */
  preference?: ThemePreference;
  /** Applied in BOTH modes (a later sheet: wins over the defaults). */
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
  /** Where the theme's `.dark` class goes — a DELIVERY concern, not user
   *  config: the custom element passes its shadow wrapper so theming never
   *  touches the host page. Default: document.documentElement. */
  themeTarget?: HTMLElement | null;
  /** Called once the workspace kernel is live, with the viewer handle — the
   *  DRIVE surface (`el.viewer` on the custom element, `onReady` on the
   *  wrappers). Capabilities resolve from the moment this fires; document-
   *  scoped calls simply await their document. */
  onViewer?: (viewer: ViewerHandle) => void;
}

/** Inside <Viewer>: mints the handle from the live kernel, reports it up. */
function HandleBridge({ onViewer }: { onViewer: (viewer: ViewerHandle) => void }) {
  const kernel = useKernel();
  useEffect(() => {
    onViewer(createViewerHandle(kernel));
    // Init-only like everything else: re-fires only if the KERNEL changes
    // (a remount), never because the callback prop identity churned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kernel]);
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
  disabledCategories,
  chrome,
  theme,
  themeTarget,
  onViewer,
}: FullViewerProps) {
  // Customization is INIT-ONLY, exactly like v2's `EmbedPDF.init` (and like
  // the Viewer's own engine/plugins contract): the whole config resolves ONCE
  // from the mount-time props, so inline literals — the idiomatic way to pass
  // it — never churn plugin identities. Later prop changes are ignored.
  const [resolved] = useState(() => {
    // ── registries: additive, user wins by id ───────────────────────────────
    const byId = new Map(defaultCommands.map((c) => [c.id, c]));
    for (const c of commands ?? []) byId.set(c.id, c);
    const resolvedCommands = [...byId.values()];

    // ── structure: an owned value (default | transform | replacement) ───────
    const resolvedChrome =
      typeof chrome === 'function'
        ? chrome(defaultChrome, chromeHelpers)
        : (chrome ?? defaultChrome);

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
    const initial =
      locale === 'auto'
        ? (negotiateLocale(codes, typeof navigator !== 'undefined' ? navigator.languages : []) ??
          'en')
        : locale;

    return {
      commands: resolvedCommands,
      chrome: resolvedChrome,
      icons: icons ?? {},
      i18n: { locales, loaders, initial },
    };
  });

  // Dev guardrail: every id the chrome references must exist; every icon a
  // command names must resolve. Warnings name the exact id (README promise).
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const ids = new Set(resolved.commands.map((c) => c.id));
    for (const problem of validateChrome(resolved.chrome, ids)) {
      console.warn(`[embedpdf] chrome: ${problem}`);
    }
    for (const c of resolved.commands) {
      if (c.icon && !(c.icon in ICON_PATHS) && !(c.icon in resolved.icons)) {
        console.warn(`[embedpdf] command "${c.id}": unknown icon "${c.icon}"`);
      }
    }
  }, [resolved]);

  const [plugins] = useState(() => [
    stagePlugin({ layout: 'vertical' }), // main lens (tools engage via interactionPlugin below)
    // Thumbnail lens over the SAME document: a single-column grid at a fixed small
    // zoom, its own camera. Click a thumb to navigate the main lens; the sidebar
    // follows the main view (see ui/panels ThumbnailList).
    stagePlugin({
      id: 'stage-thumbs',
      token: ThumbsStageToken,
      layout: 'grid',
      columns: 1, // single column, like the v2 snippet's thumbnail rail
      sizing: 'uniform', // equalize pages so the pixel target hits every thumb
      zoom: { pageWidth: 150 }, // thumbs are 150 SCREEN px wide — for ANY document
      padding: 12,
      gap: { px: 16 }, // UI-stable spacing between thumbs
      pageFrame: { top: 0, right: 0, bottom: 20, left: 0 }, // reserved label band (screen px)
      fitAlign: { x: 'center', y: 'start' }, // few pages? thumbs hug the TOP
      scrollBehavior: 'instant',
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
        {
          id: 'arrow',
          extends: 'line',
          defaults: { lineEndings: { start: 'none', end: 'open-arrow' } },
        },
      ],
    }),
    // The action engine: /A and /AA trees dispatch through one policy-gated
    // executor spine, and THE JavaScript switch lives here (the per-document
    // ScriptHost realm; form's K/V/C/F pipeline rides its transaction port).
    actionsPlugin({ javascript: { enabled: true } }),
    // Forms: fillable under the default pointer/pan (widgets render as fill
    // controls), editable under the Form tab's 'form-edit' + palette tools.
    formPlugin(),
    // Links: navigable under the default pointer/pan ('link-nav'), editable
    // under the link tool — the annotation plane then owns them (select, move,
    // retarget via the style panel's Link control).
    linkPlugin(),
    // Redaction: marking is the annotation plane's composed `redact` tool; this
    // plugin adds the pending-queue view + the destructive apply.
    redactionPlugin(),
    searchPlugin(),
    demoToolsPlugin(),
    i18nPlugin({
      locale: resolved.i18n.initial,
      fallbackLocale: 'en',
      locales: resolved.i18n.locales,
      loaders: resolved.i18n.loaders,
    }),
    commandsPlugin({
      commands: resolved.commands,
      disabledCategories: disabledCategories ? [...disabledCategories] : undefined,
    }),
    shellPlugin(),
  ]);

  // Structural subset of `resolved`, identity-stable across renders.
  const config: ResolvedViewerConfig = resolved;

  return (
    <ThemeProvider preference={themeConfigOf(theme).preference} target={themeTarget}>
      <Viewer
        engine={engine}
        plugins={plugins}
        initialDocuments={initialDocuments}
        fallback={fallback ?? <Booting />}
      >
        <ViewerConfigProvider value={config}>
          {onViewer && <HandleBridge onViewer={onViewer} />}
          <Shell />
        </ViewerConfigProvider>
      </Viewer>
    </ThemeProvider>
  );
}
