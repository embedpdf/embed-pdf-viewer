/**
 * The viewer shell — the layout's bars around the pages, driven entirely by
 * the commands + measured-toolbar system.
 *
 *   ── header socket (empty unless a child fills it) ──────────────────────
 *   ── document tabs (or the `tabs` region) ───────────────────────────────
 *   ── the top edge's bars, outside in (main, its mode bar) ───────────────
 *   start │ start  │                              │  end   │ end
 *   bars  │ panel  │ pages, the floating bars     │ panel  │ bars
 *         │        │ over them (with no document: │        │
 *         │        │ the `empty` region)          │        │
 *   ── the bottom edge's bars, outside in from the bottom ─────────────────
 *   ── footer socket (empty unless a child fills it) ──────────────────────
 *
 * The top and bottom bars run the full width; the start and end bars stand
 * between them at the viewer's edges, and a docked panel sits inside them,
 * beside the pages (places.tsx draws the bars). The workspace/document split
 * is structural: header + toolbars are workspace-scoped and render at t≈0
 * (translated, measured) while the wasm engine still boots; everything
 * document-scoped sits inside <DocumentGate>, whose fallback is the
 * empty-workspace state, shown under a live toolbar rather than replacing the
 * whole app. The floating bars float over the pages, so they come with them.
 *
 * Which mode bar shows is not stored anywhere: it's a projection of
 * plugin-shell's exclusive 'mode' surface, read null-safely so the bar simply
 * doesn't exist without a document.
 */
import { tabsOf } from '@embedpdf/core-ui';
import { useActionsUiAdapter } from '@embedpdf/react/actions';
import { AnnotationLayer, useFilePickerProvider } from '@embedpdf/react/annotation';
import { useCommandShortcuts } from '@embedpdf/react/commands';
import { FormLayer } from '@embedpdf/react/form';
import { useT } from '@embedpdf/react/i18n';
import { LinkLayer } from '@embedpdf/react/link';
import { useMeasurementState } from '@embedpdf/react/measurement';
import { RenderLayer } from '@embedpdf/react/render';
import { DocumentGate, useDocument, useDocumentId } from '@embedpdf/react/runtime';
import { SearchLayer } from '@embedpdf/react/search';
import { SelectionClipboard, SelectionHandles, SelectionLayer } from '@embedpdf/react/selection';
import { useSurface } from '@embedpdf/react/shell';
import { Scrollbar, Stage } from '@embedpdf/react/stage';
import { useRef, type ReactNode } from 'react';

import { OUTLINE_PROPERTIES_DIALOG } from './config/outline';
import { useLayoutEnv, useResolvedLayout } from './config-context';
import { LayoutRoot } from './layout-root';
import { EdgeBars, FloatingBars } from './places';
import { AnnotationFontsProvider } from './ui/annotation-fonts';
import { AnnotationStrip } from './ui/annotation-strip';
import { DocumentError, PasswordPrompt } from './ui/document-boot';
import { DropToOpen } from './ui/drop-to-open';
import { GoToPageDialog } from './ui/go-to-page';
import { FeaturePrefetch, lazyComponent } from './ui/lazy';
import { SidePanel } from './ui/panels';
import { PlacedComponentsHost, type PlacedComponents } from './ui/placed-components';
import { useRefusalNotice } from './ui/refusal-notice';
import { RotationBadge } from './ui/rotation-badge';
import { SelectionStrip } from './ui/selection-strip';
import { ShortcutsSheet } from './ui/shortcuts-sheet';
import { SidebarReads } from './ui/sidebar-reads';
import { SignatureBridge } from './ui/signature-bridge';
import { StampLibraryStore } from './ui/stamp-store';
import { TabBar } from './ui/tab-bar';
import { ArmedToolCursor } from './ui/tool-cursor';
import { LeaveWarning } from './ui/unsaved-changes';

// The dialogs and the inspector of a feature: each loads the first time it opens.
const useRedactConfirmOpen = () => useSurface('redact-confirm').isOpen;
const useCalibrating = () => useMeasurementState((state) => state.calibrationRequest !== null);
const useSignDialogOpen = () => useSurface('signature-sign').isOpen;
const useSignatureMakerOpen = () => useSurface('signature-maker').isOpen;
const useSignatureInspectorOpen = () => useSurface('signature-inspector').isOpen;
const usePrintDialogOpen = () => useSurface('print').isOpen;
const RedactConfirmModal = lazyComponent(
  () => import('./ui/redact-confirm').then((ui) => ui.RedactConfirmModal),
  { shownWhile: useRedactConfirmOpen },
);
const CalibrationDialog = lazyComponent(
  () => import('./ui/measurement').then((ui) => ui.CalibrationDialog),
  { shownWhile: useCalibrating },
);
const SignDialog = lazyComponent(() => import('./ui/sign-dialog').then((ui) => ui.SignDialog), {
  shownWhile: useSignDialogOpen,
});
const SignatureMakerModal = lazyComponent(
  () => import('./ui/signature-maker').then((ui) => ui.SignatureMakerModal),
  { shownWhile: useSignatureMakerOpen },
);
const SignatureInspector = lazyComponent(
  () => import('./ui/signature-inspector').then((ui) => ui.SignatureInspector),
  { shownWhile: useSignatureInspectorOpen },
);
const PrintDialog = lazyComponent(() => import('./ui/print-dialog').then((ui) => ui.PrintDialog), {
  shownWhile: usePrintDialogOpen,
});
const useOutlinePropertiesOpen = () => useSurface(OUTLINE_PROPERTIES_DIALOG).isOpen;
// A share link's passphrase or questions: only documents from share links ask, so these load
// when they first show, never in the background.
const SharePrompt = lazyComponent(() => import('./ui/share-prompt').then((ui) => ui.SharePrompt), {
  prefetch: false,
});
const useIdentityAsked = () => useDocument((document) => document.identityRequest !== undefined);
const VisitorIdentityDialog = lazyComponent(
  () => import('./ui/share-prompt').then((ui) => ui.VisitorIdentityDialog),
  { shownWhile: useIdentityAsked, prefetch: false },
);
const OutlinePropertiesDialog = lazyComponent(
  () => import('./ui/outline-properties').then((ui) => ui.OutlinePropertiesDialog),
  { shownWhile: useOutlinePropertiesOpen },
);

/** The document tabs, as the layout says: always, while more than one document is open, or never. */
function DocumentTabs() {
  const visibility = tabsOf(useResolvedLayout().data);
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
 * The document area's lifecycle switch. With no document open it shows the
 * `empty` region, or nothing. A `locked` tab shows its password prompt, an
 * `error` tab its error pane, or the share link's passphrase or questions it
 * waits for — per tab (keyed by document), so several can coexist and tab
 * switching stays free. Everything else is the ready-gated Stage; the gate's
 * fallback covers `loading`.
 */
function DocumentArea({ children }: { children: ReactNode }) {
  const docId = useDocumentId();
  const status = useDocument((document) => document.status);
  const shareAsks = useDocument((document) => document.shareRequest !== undefined);
  if (docId === null) {
    return (
      <div className="min-w-0 flex-1 overflow-auto">
        <slot name="empty" />
      </div>
    );
  }
  if (status === 'locked') return <PasswordPrompt key={docId} />;
  if (status === 'error') {
    return shareAsks ? <SharePrompt key={docId} /> : <DocumentError key={docId} />;
  }
  return <DocumentGate fallback={<OpeningDocuments />}>{children}</DocumentGate>;
}

/**
 * What's drawn over the pages: it follows the viewer's direction, while the pages under it keep
 * their own left-to-right layout (the Stage is `direction: ltr`).
 */
function OverPages({ children }: { children: ReactNode }) {
  const { dir } = useLayoutEnv();
  return (
    <div dir={dir} className="contents">
      {children}
    </div>
  );
}

export function Shell({ components }: { components?: PlacedComponents }) {
  // A shortcut or Copy that's refused says why in a notice.
  const refusals = useRefusalNotice();
  // The keys and copies reach this viewer only while focus is inside it (its own components,
  // and yours slotted into it), so two viewers on a page never both take one, and the page
  // keeps its own.
  const root = useRef<HTMLDivElement>(null);
  useCommandShortcuts({ target: root, onRefused: refusals.onShortcutRefused });
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
  // direct React consumers see no difference. A region nobody fills shows
  // nothing, or the viewer's own (the tabs). The bars are measured and fit
  // with zero config, and sit outside the gate: they render before any
  // document. The root measures the viewer for the layout (layout-root.tsx).
  return (
    <AnnotationFontsProvider>
      <LayoutRoot rootRef={root} className="bg-app text-fg flex h-full flex-col outline-none">
        {/* the viewer's own components in the page (<epdf-button>, <epdf-menu>), each drawn
          in its own shadow root */}
        {components && <PlacedComponentsHost components={components} />}
        {/* the user's stamp + signature libraries: restored once, persisted for
          the workspace's lifetime (workspace-scoped, like the stamp plugin) */}
        <StampLibraryStore />
        {/* leaving the page asks first while a document has unsaved changes */}
        <LeaveWarning />
        {/* The header socket. The chrome ships NO header of its own — branding,
          locale pickers and theme switches are the embedder's chrome, not the
          viewer's — so this renders nothing until a child fills the slot. */}
        <slot name="header" />

        {/* the document tab bar — the kernel's document registry IS the tab model */}
        <DocumentTabs />

        <EdgeBars edge="top" />

        <div className="relative flex min-h-0 flex-1">
          {refusals.element}
          <EdgeBars edge="start" />
          {/* a PDF dropped here opens as a new tab, as Open in the document menu does */}
          <DropToOpen className="relative flex min-w-0 flex-1">
            <DocumentArea>
              <SidePanel side="start" />
              <div className="relative min-w-0 flex-1">
                {/* the armed tool's cursor: its toolbar icon as a real CSS cursor
                (zero-lag; the hub hides it over annotations/fields/gaps) */}
                <ArmedToolCursor />
                {/* ctrl/cmd+C and native Edit→Copy for the text selection, while focus is
                inside the viewer — prefetches on commit so the copy event answers
                synchronously. Renders nothing; mount once per document view. */}
                <SelectionClipboard target={root} onRefused={refusals.onCopyRefused} />
                <Stage
                  overlay={
                    <OverPages>
                      {/* the floating bars: over the pages, under the bars over a selection */}
                      <FloatingBars />
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
                    </OverPages>
                  }
                  className="h-full w-full"
                  style={{ background: 'var(--epdf-canvas)', direction: 'ltr' }}
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
              </div>
              <SidePanel side="end" />
              <RedactConfirmModal />
              <CalibrationDialog />
              <GoToPageDialog />
              <PrintDialog />
              <OutlinePropertiesDialog />
              <ShortcutsSheet />
              {/* signatures: plugin intents → surfaces; the dialogs they open */}
              <SignatureBridge />
              {/* the outline and the attachments, read so their panels' buttons know */}
              <SidebarReads />
              {/* once a document shows: the features' panels and dialogs, fetched while idle */}
              <FeaturePrefetch />
              <SignDialog />
              <SignatureMakerModal />
              <VisitorIdentityDialog />
            </DocumentArea>
          </DropToOpen>
          <EdgeBars edge="end" />
        </div>

        <EdgeBars edge="bottom" />

        {/* The footer socket: below everything, empty until a child fills it. */}
        <slot name="footer" />
      </LayoutRoot>
    </AnnotationFontsProvider>
  );
}
