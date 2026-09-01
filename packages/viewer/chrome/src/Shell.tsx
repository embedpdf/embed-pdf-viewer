/**
 * The viewer shell — the snippet's layout, driven entirely by the v3 commands
 * + measured-toolbar system.
 *
 *   ── header socket (empty unless a child fills it) ─────────
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
import { useMemo, type ReactNode } from 'react';
import {
  DocumentGate,
  useDocumentId,
  useDocumentStatus,
  useOptionalSelector,
} from '@embedpdf/react/runtime';
import { Stage } from '@embedpdf/react/stage';
import { Scrollbar } from '@embedpdf/react/scrollbar';
import { RenderLayer } from '@embedpdf/react/render';
import { SelectionClipboard, SelectionHandles, SelectionLayer } from '@embedpdf/react/selection';
import { AnnotationLayer, useFilePickerProvider } from '@embedpdf/react/annotation';
import { LinkLayer } from '@embedpdf/react/link';
import type { AnnotationRenderer } from '@embedpdf/react/annotation';
import { useActionsUiAdapter } from '@embedpdf/react/actions';
import { formWidgetRenderer } from '@embedpdf/react/form';
import { SearchLayer } from '@embedpdf/react/search';
import { useCommandShortcuts } from '@embedpdf/react/commands';
import { ShellToken } from '@embedpdf/react/shell';
import { useT } from '@embedpdf/react/i18n';
import { getModeBar } from './config/chrome';
import { useChromeSchema } from './config-context';
import { AppToolbar } from './ui/toolbar';
import { AnnotationStrip } from './ui/annotation-strip';
import { SelectionStrip } from './ui/selection-strip';
import { TabBar } from './ui/tab-bar';
import { ArmedToolCursor } from './ui/tool-cursor';
import { LeftSidebar, RightSidebar, PageControls } from './ui/panels';
import { RedactConfirmModal } from './ui/redact-confirm';
import { DocumentError, PasswordPrompt } from './ui/document-boot';

// Annotation renderers — module scope, per the AnnotationRenderer identity
// rule. One entry today: form widgets render as fill controls while the form
// plugin's Behavior is engaged.
const ANNOTATION_RENDERERS: AnnotationRenderer[] = [formWidgetRenderer];

function ModeBand({ edge }: { edge: 'top' | 'bottom' }) {
  const schema = useChromeSchema();
  // The mode list is DERIVED from the chrome's modeBars keys — adding a custom
  // mode is one command + one bar schema in config, not a shell change.
  const modeSurfaces = useMemo(() => Object.keys(schema.modeBars ?? {}), [schema]);
  const activeMode = useOptionalSelector(
    ShellToken,
    (s) => modeSurfaces.find((m) => s.isOpen(m)) ?? null,
    null,
  );
  if (!activeMode) return null;
  const bar = getModeBar(schema, activeMode);
  if (!bar) return null;
  return (
    <div
      className={`border-border bg-surface-alt flex shrink-0 items-center px-4 py-2 ${
        edge === 'top' ? 'border-b' : 'border-t'
      }`}
    >
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

/**
 * The document area's lifecycle switch. A `locked` tab shows its password
 * prompt, an `error` tab its error pane — per TAB (keyed by document), so
 * several can coexist and tab switching stays free. Everything else is the
 * ready-gated Stage; the gate's fallback covers `loading`.
 */
function DocumentArea({ children }: { children: ReactNode }) {
  const docId = useDocumentId();
  const status = useDocumentStatus();
  if (status === 'locked') return <PasswordPrompt key={docId} />;
  if (status === 'error') return <DocumentError key={docId} />;
  return <DocumentGate fallback={<OpeningDocuments />}>{children}</DocumentGate>;
}

export function Shell() {
  useCommandShortcuts();
  // Click-then-pick tools (stamp, file attachment) → click a page → file dialog
  // opens → the file lands where you clicked. One line: the default provider is
  // the built-in file picker honouring each tool's `accept` filter (swap it for
  // a custom picker, or pass null to disable). The plugin stays DOM-free.
  useFilePickerProvider();
  // The ONE UI port for the action engine AND every script-produced effect:
  // sanitized URI opens, Named `Print`, script alerts (boot/lifecycle nags
  // suppressed by default), and script page navigation.
  useActionsUiAdapter();
  const schema = useChromeSchema();

  // The FRAME: region arrangement & visibility from the chrome value (see
  // FrameSchema). Regions render as named <slot> sockets with the built-ins
  // as fallback — light-DOM children of <embedpdf-viewer> replace them; in
  // plain light DOM a slot just displays its fallback (UA display:contents),
  // so this package's direct React consumers see no difference. A region
  // hidden by the frame hides its socket too: visibility outranks content.
  const frame = schema.frame ?? {};
  const toolbarEdge = frame.toolbar ?? 'top';

  // main toolbar — measured; degrades + overflows with zero config.
  // Deliberately OUTSIDE the gate: chrome renders before any document.
  // Bar id 'main' is the shell's one structural expectation — an owned
  // chrome without it simply has no main toolbar. Its mode band rides the
  // CONTENT side, whichever edge the frame picked.
  const toolbarBand = schema.bars.main && (
    <div
      part="toolbar"
      className={`border-border bg-surface flex shrink-0 items-center px-4 py-2 ${
        toolbarEdge === 'top' ? 'border-b' : 'border-t'
      }`}
    >
      <AppToolbar bar={schema.bars.main} className="w-full" />
    </div>
  );

  return (
    <div className="bg-app text-fg flex h-full flex-col">
      {/* The header socket. The chrome ships NO header of its own — branding,
          locale pickers and theme switches are the embedder's chrome, not the
          viewer's — so this renders nothing until a child fills the slot. */}
      {(frame.header ?? true) && <slot name="header" />}

      {/* the v2 document tab bar — the kernel's document registry IS the tab model */}
      {(frame.tabs ?? 'always') !== 'never' && (
        <slot name="tabs">
          <TabBar visibility={frame.tabs ?? 'always'} />
        </slot>
      )}

      {toolbarEdge === 'top' && (
        <>
          {toolbarBand}
          <ModeBand edge="top" />
        </>
      )}

      <div className="relative flex min-h-0 flex-1">
        <DocumentArea>
          <LeftSidebar />
          <div className="relative min-w-0 flex-1">
            {/* the armed tool's cursor: its toolbar icon as a real CSS cursor
                (zero-lag; the hub hides it over annotations/fields/gaps) */}
            <ArmedToolCursor />
            {/* ctrl/cmd+C and native Edit→Copy for the text selection —
                prefetches on commit so the copy event answers synchronously.
                Renders nothing; mount ONCE per document view. */}
            <SelectionClipboard />
            <Stage
              overlay={
                <>
                  <AnnotationStrip />
                  <SelectionStrip />
                  {/* touch: draggable start/end selection handles (long-press
                      selects a word; the lollipops grow it from there) */}
                  <SelectionHandles />
                  {/* headless scrollbars: geometry/behavior from the stage's
                      scroller contract; the look is index.css (data-attrs) */}
                  <Scrollbar axis="y" />
                  <Scrollbar axis="x" />
                </>
              }
              className="h-full w-full"
              style={{ background: 'var(--ep-canvas)' }}
            >
              {() => (
                <>
                  {/* Base + deep-zoom tiles in one layer. Tiles engage by
                      demand arithmetic when the view wants more pixels than
                      the base budget supplies — the thumbnail rail's demand
                      never does, so it mounts the same layer for free. */}
                  <RenderLayer annotations={false} />
                  <SelectionLayer />
                  <SearchLayer />
                  {/* Clickable links (nav plane): anchors under the default
                      pointer/pan tools; stands down whenever an authoring
                      tool is active (the annotation plane owns links then).
                      Below the AnnotationLayer so an editing free-text box
                      wins pointer hits; the annotation layer's own surface
                      is pointer-events: none, so clicks fall through to the
                      anchors everywhere else. */}
                  <LinkLayer />
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
          <RedactConfirmModal />
        </DocumentArea>
      </div>

      {toolbarEdge === 'bottom' && (
        <>
          <ModeBand edge="bottom" />
          {toolbarBand}
        </>
      )}
    </div>
  );
}
