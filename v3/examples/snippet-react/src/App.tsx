/**
 * Root. Builds the plugin set (plain pure values), boots a non-blocking engine,
 * and mounts the shell. The chrome — toolbars, translations, theme — renders at
 * t≈0; only the pages wait on the wasm engine.
 */
// One import line per feature (v3/ADAPTERS.md): each subpath carries the
// plugin AND its UI; delete a line and the feature leaves the bundle.
import { useEffect, useMemo } from 'react';
import { Viewer, useDocuments } from '@embedpdf-x/react/runtime';
import { stagePlugin } from '@embedpdf-x/react/stage';
import { renderPlugin } from '@embedpdf-x/react/render';
import { pageEditPlugin } from '@embedpdf-x/react/page-edit';
import { interactionPlugin } from '@embedpdf-x/react/interaction';
import { selectionPlugin } from '@embedpdf-x/react/selection';
import { annotationPlugin } from '@embedpdf-x/react/annotation';
import { redactionPlugin } from '@embedpdf-x/react/redaction';
import { formPlugin } from '@embedpdf-x/react/form';
import { searchPlugin } from '@embedpdf-x/react/search';
import { i18nPlugin, negotiateLocale, useT } from '@embedpdf-x/react/i18n';
import { commandsPlugin } from '@embedpdf-x/react/commands';
import { shellPlugin } from '@embedpdf-x/react/shell';
import { createDeferredEngine, loadInitialDocuments } from './engine';
import { ThumbsStageToken } from './config/stage';
import { commands } from './config/commands';
import { demoToolsPlugin } from './config/demo-tools.plugin';
import { en } from './locales/en';
import { ThemeProvider } from './ui/theme';
import { Shell } from './Shell';

const plugins = [
  stagePlugin({ layout: 'vertical', interaction: true }), // main lens; drives the interaction hub
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
  interactionPlugin({ defaultTool: 'pointer' }),
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
  // Forms: fillable under the default pointer/pan (widgets render as fill
  // controls), editable under the Form tab's 'form-edit' + palette tools.
  formPlugin({ scripting: { enabled: true } }),
  // Redaction: marking is the annotation plane's composed `redact` tool; this
  // plugin adds the pending-queue view + the destructive apply.
  redactionPlugin(),
  searchPlugin(),
  demoToolsPlugin(),
  i18nPlugin({
    locale: negotiateLocale(['en', 'es'], navigator.languages) ?? 'en',
    fallbackLocale: 'en',
    locales: [en],
    loaders: { es: () => import('./locales/es').then((m) => m.es) },
  }),
  commandsPlugin({ commands }),
  shellPlugin(),
];

function Booting() {
  const t = useT();
  return (
    <div className="bg-app text-fg-muted grid h-full place-items-center">
      <div className="animate-pulse text-sm">{t('demo.starting')}</div>
    </div>
  );
}

/** Opens the sample documents once the kernel is up (bytes fetched lazily). */
function OpenInitialDocuments() {
  const { open, docs } = useDocuments();
  useEffect(() => {
    if (docs.length > 0) return;
    let alive = true;
    (async () => {
      const initial = await loadInitialDocuments();
      if (!alive) return;
      for (const doc of initial) await open(doc.source, { name: doc.name });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function App() {
  const engine = useMemo(createDeferredEngine, []);
  return (
    <ThemeProvider>
      <Viewer engine={engine} plugins={plugins} fallback={<Booting />}>
        <OpenInitialDocuments />
        <Shell />
      </Viewer>
    </ThemeProvider>
  );
}
