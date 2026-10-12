/**
 * The viewer shell — the layout's bars around the pages, driven entirely by
 * the commands + measured-toolbar system.
 *
 *   ── header socket (empty unless a child fills it) ─────────
 *   ── document tabs ─────────────────────────────────────────
 *   ── the top edge's bars, outside in (main, its mode bar) ──
 *   left sidebar │        Stage (pages)        │ right sidebar
 *   ──────────── page-controls overlay ──────────────────────
 *   ── the bottom edge's bars, outside in from the bottom ────
 *
 * The workspace/document split is structural: header + toolbars are
 * workspace-scoped and render at t≈0 (translated, measured) while the wasm
 * engine still boots; everything document-scoped sits inside <DocumentGate>,
 * whose fallback is the empty-workspace state, shown under a live toolbar
 * rather than replacing the whole app.
 *
 * Which mode bar shows is not stored anywhere: it's a projection of
 * plugin-shell's exclusive 'mode' surface, read null-safely so the bar simply
 * doesn't exist without a document. Bars at the start and end edges and
 * floating bars are in the layout but not drawn here yet; the page number is
 * <PageControls>.
 */
import { useMemo, type ReactNode } from 'react';
import {
  DocumentGate,
  useDocument,
  useDocumentId,
  useKernelValue,
  useOptionalSelector,
} from '@embedpdf/react/runtime';
import { Scrollbar, Stage } from '@embedpdf/react/stage';
import { RenderLayer } from '@embedpdf/react/render';
import { SelectionClipboard, SelectionHandles, SelectionLayer } from '@embedpdf/react/selection';
import { AnnotationLayer, useFilePickerProvider } from '@embedpdf/react/annotation';
import { LinkLayer } from '@embedpdf/react/link';
import { useActionsUiAdapter } from '@embedpdf/react/actions';
import { FormLayer } from '@embedpdf/react/form';
import { SearchLayer } from '@embedpdf/react/search';
import { useCommandShortcuts, useCommands } from '@embedpdf/react/commands';
import { ShellToken } from '@embedpdf/react/shell';
import { useT } from '@embedpdf/react/i18n';
import {
  commandOfUnit,
  edgeStackOf,
  hasVisibleUnits,
  hostOf,
  modeCommandOf,
  normalizeBar,
  type BarSchema,
} from '@embedpdf/core-ui';
import { openModeSurfaceOf } from './config/modes';
import { useResolvedLayout } from './config-context';
import { LayoutRoot } from './layout-root';
import { AppToolbar } from './ui/toolbar';
import { AnnotationFontsProvider } from './ui/annotation-fonts';
import { AnnotationStrip } from './ui/annotation-strip';
import { SelectionStrip } from './ui/selection-strip';
import { TabBar } from './ui/tab-bar';
import { ArmedToolCursor } from './ui/tool-cursor';
import { RotationBadge } from './ui/rotation-badge';
import { LeftSidebar, RightSidebar, PageControls } from './ui/panels';
import { CalibrationDialog } from './ui/measurement';
import { RedactConfirmModal } from './ui/redact-confirm';
import { SignDialog } from './ui/sign-dialog';
import { SignatureBridge } from './ui/signature-bridge';
import { SignatureInspector } from './ui/signature-inspector';
import { SignatureMakerModal } from './ui/signature-maker';
import { StampLibraryStore } from './ui/stamp-store';
import { DocumentError, PasswordPrompt } from './ui/document-boot';
import { useRefusalNotice } from './ui/refusal-notice';

/** Whether anything in the bar is visible now: a bar with nothing visible draws nothing. */
function useBarShows(bar: BarSchema | null): boolean {
  const commands = useCommands();
  const documentId = useDocumentId() ?? undefined;
  const normalized = useMemo(() => (bar ? normalizeBar(bar) : null), [bar]);
  return useKernelValue(
    () =>
      normalized !== null &&
      hasVisibleUnits(normalized, (unit) => {
        const command = commandOfUnit(unit);
        return command !== null && commands.resolveCommand(command, documentId)?.visible === true;
      }),
  );
}

/** One bar along an edge: its toolbar in a band, or nothing when nothing in it is visible. */
function BarBand({ id, edge, rides }: { id: string; edge: 'top' | 'bottom'; rides: boolean }) {
  const bar = useResolvedLayout().bar(id);
  const shows = useBarShows(bar);
  if (!bar || !shows) return null;
  return (
    <div
      // `toolbar` is the main bar's part name, which page CSS reaches.
      part={id === 'main' ? 'toolbar' : undefined}
      data-bar={id}
      className={`border-border flex shrink-0 items-center px-4 py-2 ${
        rides ? 'bg-surface-alt' : 'bg-surface'
      } ${edge === 'top' ? 'border-b' : 'border-t'}`}
    >
      <AppToolbar bar={bar} className="w-full" />
    </div>
  );
}

/**
 * The bars along the top or the bottom edge, from the outside in, each followed by the bars
 * riding along it on the side of the pages. A bar with a mode shows while that mode is open.
 */
function EdgeBars({ edge }: { edge: 'top' | 'bottom' }) {
  const { data } = useResolvedLayout();
  const openMode = useOptionalSelector(ShellToken, openModeSurfaceOf, null);
  const stack = useMemo(() => edgeStackOf(data, edge), [data, edge]);
  const shown = stack.filter((id) => {
    const mode = data.bars?.[id]?.mode;
    return mode === undefined || openMode === modeCommandOf(mode);
  });
  // From the outside in is top to bottom on the top edge, and bottom to top on the bottom one.
  const ordered = edge === 'top' ? shown : [...shown].reverse();
  return (
    <>
      {ordered.map((id) => (
        <BarBand key={id} id={id} edge={edge} rides={hostOf(data.bars?.[id]?.place) !== null} />
      ))}
    </>
  );
}

/** The document tabs, as the layout says: always, while more than one document is open, or never. */
function DocumentTabs() {
  const visibility = useResolvedLayout().data.tabs ?? 'always';
  if (visibility === 'never') return null;
  return (
    <slot name="tabs">
      <TabBar visibility={visibility} />
    </slot>
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
 * prompt, an `error` tab its error pane — per tab (keyed by document), so
 * several can coexist and tab switching stays free. Everything else is the
 * ready-gated Stage; the gate's fallback covers `loading`.
 */
function DocumentArea({ children }: { children: ReactNode }) {
  const docId = useDocumentId();
  const status = useDocument((document) => document.status);
  if (status === 'locked') return <PasswordPrompt key={docId} />;
  if (status === 'error') return <DocumentError key={docId} />;
  return <DocumentGate fallback={<OpeningDocuments />}>{children}</DocumentGate>;
}

export function Shell() {
  // A shortcut or Copy that's refused says why in a notice.
  const refusals = useRefusalNotice();
  useCommandShortcuts({ onRefused: refusals.onShortcutRefused });
  // Click-then-pick tools (stamp, file attachment) → click a page → file dialog
  // opens → the file lands where you clicked. One line: the default provider is
  // the built-in file picker honouring each tool's `accept` filter (swap it for
  // a custom picker, or pass null to disable). The plugin stays DOM-free.
  useFilePickerProvider();
  // The one UI port for the action engine and every script-produced effect:
  // sanitized URI opens, Named `Print`, script alerts (boot/lifecycle nags
  // suppressed by default), and script page navigation.
  useActionsUiAdapter();

  // Regions render as named <slot> sockets with the built-ins as fallback —
  // light-DOM children of <embedpdf-viewer> replace them; in plain light DOM a
  // slot just displays its fallback (UA display:contents), so this package's
  // direct React consumers see no difference. The bars are measured and fit
  // with zero config, and sit outside the gate: they render before any
  // document. The root measures the viewer for the layout (layout-root.tsx).
  return (
    <AnnotationFontsProvider>
      <LayoutRoot className="bg-app text-fg flex h-full flex-col">
        {/* the user's stamp + signature libraries: restored once, persisted for
          the workspace's lifetime (workspace-scoped, like the stamp plugin) */}
        <StampLibraryStore />
        {/* The header socket. The chrome ships NO header of its own — branding,
          locale pickers and theme switches are the embedder's chrome, not the
          viewer's — so this renders nothing until a child fills the slot. */}
        <slot name="header" />

        {/* the document tab bar — the kernel's document registry IS the tab model */}
        <DocumentTabs />

        <EdgeBars edge="top" />

        <div className="relative flex min-h-0 flex-1">
          {refusals.element}
          <DocumentArea>
            <LeftSidebar />
            <div className="relative min-w-0 flex-1">
              {/* the armed tool's cursor: its toolbar icon as a real CSS cursor
                (zero-lag; the hub hides it over annotations/fields/gaps) */}
              <ArmedToolCursor />
              {/* ctrl/cmd+C and native Edit→Copy for the text selection —
                prefetches on commit so the copy event answers synchronously.
                Renders nothing; mount ONCE per document view. */}
              <SelectionClipboard onRefused={refusals.onCopyRefused} />
              <Stage
                overlay={
                  <>
                    <AnnotationStrip />
                    {/* the angle a selection is being turned to, by the pointer */}
                    <RotationBadge />
                    <SelectionStrip />
                    {/* a signed field's facts, anchored at its widget */}
                    <SignatureInspector />
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
                    <RenderLayer />
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
                    <AnnotationLayer />
                    {/* The fields' pictures, and fill controls over them
                      while the active tool fills forms; the render layer
                      leaves the fields to it, as it leaves the annotations
                      to the annotation layer. */}
                    <FormLayer />
                  </>
                )}
              </Stage>
              <PageControls />
            </div>
            <RightSidebar />
            <RedactConfirmModal />
            <CalibrationDialog />
            {/* signatures: plugin intents → surfaces; the dialogs they open */}
            <SignatureBridge />
            <SignDialog />
            <SignatureMakerModal />
          </DocumentArea>
        </div>

        <EdgeBars edge="bottom" />
      </LayoutRoot>
    </AnnotationFontsProvider>
  );
}
