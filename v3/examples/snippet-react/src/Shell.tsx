/**
 * The viewer shell — the snippet's layout, driven entirely by the v3 commands
 * + measured-toolbar system.
 *
 *   Header
 *   ── main toolbar (measured; auto-overflows) ───────────────
 *   ── mode band (DERIVED from the shell's open mode surface) ─
 *   left sidebar │        Stage (pages)        │ right sidebar
 *   ──────────── page-controls overlay ──────────────────────
 *
 * The workspace/document split is structural: header + toolbars are
 * workspace-scoped and render at t≈0 (translated, measured) while the wasm
 * engine still boots; everything document-scoped sits inside <DocumentGate>,
 * whose fallback is the empty-workspace state (v2's loader, but UNDER a live
 * toolbar instead of replacing the whole app).
 *
 * Which mode band shows is not stored anywhere: it's a projection of
 * plugin-shell's exclusive 'mode' surface, read null-safely so the band simply
 * doesn't exist without a document.
 */
import { DocumentGate, useOptionalSelector } from '@embedpdf-x/react/runtime';
import { Stage } from '@embedpdf-x/react/stage';
import { Scrollbar } from '@embedpdf-x/react/scrollbar';
import { RenderLayer } from '@embedpdf-x/react/render';
import { SelectionLayer } from '@embedpdf-x/react/selection';
import { AnnotationLayer, ToolBadge, useStampProvider } from '@embedpdf-x/react/annotation';
import type { AnnotationRenderer } from '@embedpdf-x/react/annotation';
import { formWidgetRenderer, useFormScriptingProvider } from '@embedpdf-x/react/form';
import { SearchLayer } from '@embedpdf-x/react/search';
import { useCommandShortcuts } from '@embedpdf-x/react/commands';
import { ShellToken } from '@embedpdf-x/react/shell';
import { useT } from '@embedpdf-x/react/i18n';
import { chrome, getModeBar } from './config/chrome';
import { MODE_SURFACES } from './config/commands';
import { AppToolbar } from './ui/toolbar';
import { AnnotationStrip } from './ui/annotation-strip';
import { TabBar } from './ui/tab-bar';
import { ToolBadgeIcon } from './ui/tool-badge';
import { Header, LeftSidebar, RightSidebar, PageControls } from './ui/panels';

// Annotation renderers — module scope, per the AnnotationRenderer identity
// rule. One entry today: form widgets render as fill controls while the form
// plugin's Behavior is engaged.
const ANNOTATION_RENDERERS: AnnotationRenderer[] = [formWidgetRenderer];

function ModeBand() {
  const activeMode = useOptionalSelector(
    ShellToken,
    (s) => MODE_SURFACES.find((m) => s.isOpen(m)) ?? null,
    null,
  );
  if (!activeMode) return null;
  const bar = getModeBar(activeMode);
  if (!bar) return null;
  return (
    <div className="border-border bg-surface-alt flex shrink-0 items-center border-b px-4 py-2">
      <AppToolbar bar={bar} className="w-full" />
    </div>
  );
}

/** The empty-workspace state: shown while the initial documents (and the
 *  engine behind them) are still loading — or if the user closes every tab. */
function OpeningDocuments() {
  const t = useT();
  return (
    <div className="grid h-full w-full place-items-center">
      <div className="text-fg-muted flex flex-col items-center gap-3">
        <div className="border-border-subtle border-t-accent h-8 w-8 animate-spin rounded-full border-2" />
        <div className="text-sm">{t('demo.opening')}</div>
      </div>
    </div>
  );
}

export function Shell() {
  useCommandShortcuts();
  // Stamp tool → click a page → file dialog opens → image lands where you clicked.
  // One line: the default provider is the built-in file picker (swap it for a
  // custom picker, or pass null to disable). The plugin stays DOM-free.
  useStampProvider();
  // Form scripts stay inside the isolated form pipeline; this hook fulfils the
  // resulting alert, page-navigation, and print UI requests in the React shell.
  useFormScriptingProvider();
  return (
    <div className="bg-app text-fg flex h-full flex-col">
      <Header />

      {/* the v2 document tab bar — the kernel's document registry IS the tab model */}
      <TabBar visibility="always" />

      {/* main toolbar — measured; degrades + overflows with zero config.
          Deliberately OUTSIDE the gate: chrome renders before any document. */}
      <div className="border-border bg-surface flex shrink-0 items-center border-b px-4 py-2">
        <AppToolbar bar={chrome.bars.main} className="w-full" />
      </div>

      <ModeBand />

      <div className="relative flex min-h-0 flex-1">
        <DocumentGate fallback={<OpeningDocuments />}>
          <LeftSidebar />
          <div className="relative min-w-0 flex-1">
            <Stage
              interaction
              overlay={
                <>
                  <AnnotationStrip />
                  {/* cursor chrome: the armed tool's badge rides the pointer,
                      rendered with the SAME icon+accent as its toolbar button */}
                  <ToolBadge renderer={ToolBadgeIcon} />
                  {/* headless scrollbars: geometry/behavior from the stage's
                      scroller contract; the look is index.css (data-attrs) */}
                  <Scrollbar axis="y" />
                  <Scrollbar axis="x" />
                </>
              }
              className="h-full w-full"
              style={{ background: 'var(--canvas)' }}
            >
              {() => (
                <>
                  <RenderLayer annotations={false} />
                  <SelectionLayer />
                  <SearchLayer />
                  {/* Form widgets plug into the annotation stack: engaged
                      (fill mode) they render as fill controls over the baked
                      appearance; under the Form tab they're plain editable
                      annotations. */}
                  <AnnotationLayer renderers={ANNOTATION_RENDERERS} />
                </>
              )}
            </Stage>
            <PageControls />
          </div>
          <RightSidebar />
        </DocumentGate>
      </div>
    </div>
  );
}
