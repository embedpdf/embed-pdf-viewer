/**
 * The layout's panels, drawn: on each side of the pages, the panel open on
 * that side, in the frame that opens it (docked beside the pages, over them,
 * or as a sheet: panel-frame.tsx). The panels on one side take turns: opening
 * one closes the other, however it was opened. The header switches between
 * the panels on the side; the body is the slot `panel:<id>`, which holds the
 * built-in content, so content of your own replaces it, and a panel of your
 * own with nothing in its slot is empty.
 *
 * Which panels are open is each document's own (the shell plugin keeps them
 * per document), so switching documents brings back that document's panels.
 * A panel whose button no longer shows (its feature turned off, or not
 * allowed) closes.
 */
import { panelCommandOf } from '@embedpdf/core-ui';
import { useCommands } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import { RenderLayer } from '@embedpdf/react/render';
import { useDocumentId, useKernelValue, useOptionalCapability } from '@embedpdf/react/runtime';
import { ShellToken, useShellEvent } from '@embedpdf/react/shell';
import { Stage, useStage, useStageState } from '@embedpdf/react/stage';
import { useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';

import { panelsOnSide } from '../config/panels';
import { ThumbsStageToken } from '../config/stage';
import { useResolvedLayout } from '../config-context';
import { lazyComponent } from './lazy';
import { PanelFrame, useCloseOnPick } from './panel-frame';
import type { PanelSide } from './panel-layout';
import { PanelSwitcher } from './panel-switcher';

// Each feature's panel loads the first time it opens.
const SearchPanel = lazyComponent(() => import('./search-panel').then((ui) => ui.SearchPanel));
const CommentsPanel = lazyComponent(() =>
  import('./comments-panel').then((ui) => ui.CommentsPanel),
);
const MeasurementSection = lazyComponent(() =>
  import('./measurement').then((ui) => ui.MeasurementSection),
);
const AnnotationStylePanel = lazyComponent(() =>
  import('./annotation-style').then((ui) => ui.AnnotationStylePanel),
);
const StampsPanel = lazyComponent(() => import('./stamps-panel').then((ui) => ui.StampsPanel));
const SignaturesPanel = lazyComponent(() =>
  import('./signatures-panel').then((ui) => ui.SignaturesPanel),
);
const RedactionPanel = lazyComponent(() =>
  import('./redaction-panel').then((ui) => ui.RedactionPanel),
);

/** What a built-in panel draws in its slot. */
interface BuiltInContent {
  readonly draw: (documentId: string | null) => ReactNode;
  /** It holds a list: in a sheet or an overlay, picking one of its items closes the panel. */
  readonly list?: boolean;
}

const BUILT_IN_CONTENT: ReadonlyMap<string, BuiltInContent> = new Map<string, BuiltInContent>([
  ['thumbnails', { draw: () => <ThumbnailList />, list: true }],
  // These read the document as they mount, so each document gets its own.
  ['search', { draw: (documentId) => <SearchPanel key={documentId ?? 'none'} />, list: true }],
  ['comments', { draw: (documentId) => <CommentsPanel key={documentId ?? 'none'} /> }],
  ['measurement', { draw: (documentId) => <MeasurementSection key={documentId ?? 'none'} /> }],
  ['style', { draw: () => <AnnotationStylePanel /> }],
  ['stamps', { draw: () => <StampsPanel /> }],
  ['signatures', { draw: () => <SignaturesPanel /> }],
  ['redaction', { draw: () => <RedactionPanel /> }],
]);

const NONE: readonly string[] = [];

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, i) => value === right[i]);

/** One side's panels: which show (their buttons do), which are turned off, which are open. */
interface SideState {
  readonly shown: readonly string[];
  readonly off: readonly string[];
  readonly open: readonly string[];
}

const sameSide = (left: SideState, right: SideState): boolean =>
  sameStrings(left.shown, right.shown) &&
  sameStrings(left.off, right.off) &&
  sameStrings(left.open, right.open);

/** The panel open on one side of the pages, if any, of the layout's panels on that side. */
export function SidePanel({ side }: { side: PanelSide }) {
  const { data } = useResolvedLayout();
  const commands = useCommands();
  const shell = useOptionalCapability(ShellToken);
  const documentId = useDocumentId();
  const ids = useMemo(() => panelsOnSide(data, side), [data, side]);
  const { shown, off, open } = useKernelValue((): SideState => {
    const visibleOf = (id: string) =>
      commands.resolveCommand(panelCommandOf(id), documentId ?? undefined)?.visible;
    return {
      shown: ids.filter((id) => visibleOf(id) === true),
      // A panel whose command isn't registered is neither: it isn't drawn, and it isn't closed.
      off: ids.filter((id) => visibleOf(id) === false),
      open: shell ? ids.filter((id) => shell.isOpen(id)) : NONE,
    };
  }, sameSide);

  // Opening a panel closes the one open on its side, however it was opened.
  useShellEvent(
    (current) => current.onSurfaceOpened,
    (event) => {
      if (!shell || !ids.includes(event.id)) return;
      for (const id of ids) if (id !== event.id && shell.isOpen(id)) shell.close(id);
    },
  );

  // The first open panel that shows is drawn. A turned-off one closes, and so does any other
  // open on this side (opened while another document showed).
  const current = open.find((id) => shown.includes(id)) ?? null;
  useLayoutEffect(() => {
    if (!shell) return;
    for (const id of open) {
      if (id !== current && (current !== null || off.includes(id))) shell.close(id);
    }
  }, [shell, open, off, current]);

  if (current === null) return null;
  return <OpenPanel key={current} id={current} side={side} siblings={shown} />;
}

/** One open panel in its frame: its title or the switcher in the header, its slot as the body. */
function OpenPanel({
  id,
  side,
  siblings,
}: {
  id: string;
  side: PanelSide;
  siblings: readonly string[];
}) {
  const t = useT();
  const panel = useResolvedLayout().data.panels?.[id];
  const shell = useOptionalCapability(ShellToken);
  const documentId = useDocumentId();
  if (!panel) return null;
  const title = panel.title ?? (panel.titleKey !== undefined ? t(panel.titleKey) : id);
  const content = BUILT_IN_CONTENT.get(id);
  return (
    <PanelFrame
      id={id}
      side={side}
      present={panel.present}
      width={panel.width}
      resizable={panel.resizable}
      title={title}
      header={
        siblings.length > 1 ? <PanelSwitcher id={id} title={title} panels={siblings} /> : undefined
      }
      list={content?.list}
      onClose={() => shell?.close(id)}
    >
      <slot name={`panel:${id}`}>{content?.draw(documentId)}</slot>
    </PanelFrame>
  );
}

// The thumbnail rail: the same document through the thumbnail Stage lens (a
// fixed-zoom grid that wraps into as many columns as the panel's width fits —
// see the viewer's `thumbnails` plugin). Click a thumb to navigate the main
// lens; the rail follows the main view. Read-only — no page edits
// (rotate/move/delete), just the page bitmap and its number.
function ThumbnailList() {
  const main = useStage(); // the main lens
  const thumbs = useStage(ThumbsStageToken); // the sidebar lens
  const currentPage = useStageState((state) => state.currentPageIndex);
  // A sheet or an overlay closes once a page is picked, so you see where it took you.
  const closeOnPick = useCloseOnPick();
  // Follow the main view: when its current page changes, make that thumb visible —
  // minimal movement, zero when it's already on screen.
  useEffect(() => thumbs.reveal(currentPage), [currentPage, thumbs]);
  return (
    <Stage
      token={ThumbsStageToken}
      className="flex-1"
      style={{ position: 'relative' }}
      pageChrome={(page) => (
        <>
          {/* BOX-SPACE chrome: the click target + selection border hug the page
              box; the number sits in the reserved bottom band. Neither rotates. */}
          <button
            type="button"
            onClick={() => {
              main.goToPage(page.pageIndex);
              closeOnPick();
            }}
            title={`Page ${page.pageIndex + 1}`}
            // The current page in the accent with a tint around it, the others in a light line.
            className={`box-border cursor-pointer rounded ${
              page.pageIndex === currentPage
                ? 'border-accent ring-accent-light border-2 ring-2'
                : 'border-border-subtle border'
            }`}
            style={{
              position: 'absolute',
              top: page.frame.top,
              left: page.frame.left,
              right: page.frame.right,
              bottom: page.frame.bottom,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: page.frame.bottom,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              color: 'var(--epdf-text-muted)',
              pointerEvents: 'none',
            }}
          >
            {page.pageIndex + 1}
          </div>
        </>
      )}
    >
      {/* page-space content: the bitmap, which rotates with the page */}
      {() => <RenderLayer />}
    </Stage>
  );
}
