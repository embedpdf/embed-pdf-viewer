/**
 * The layout's panels, drawn: on each side of the pages, the panel open on
 * that side, in the frame that opens it (docked beside the pages, over them,
 * or as a sheet: panel-frame.tsx). The panels on one side take turns: opening
 * one closes the other, however it was opened. The header switches between
 * the panels on the side; under it go the bars the layout puts in the panel
 * (`place: { panel }`); the body is the slot `panel:<id>`, which holds the
 * built-in content, so content of your own replaces it, and a panel of your
 * own with nothing in its slot is empty.
 *
 * A built-in panel with nothing to list opens as a bar instead (search whose
 * hits come without their text: the find bar).
 *
 * Which panels are open is each document's own (the shell plugin keeps them
 * per document), so switching documents brings back that document's panels.
 * A panel whose button no longer shows (its feature turned off, or not
 * allowed) closes.
 */
import { panelCommandOf } from '@embedpdf/core-ui';
import { useCommands } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import {
  useDocumentId,
  useKernelValue,
  useOptionalCapability,
  type Kernel,
} from '@embedpdf/react/runtime';
import { SearchToken } from '@embedpdf/react/search';
import { ShellToken, useShellEvent } from '@embedpdf/react/shell';
import { Fragment, useLayoutEffect, useMemo, type ReactNode } from 'react';

import { panelsOnSide } from '../config/panels';
import { useResolvedLayout } from '../config-context';
import { PanelBars } from '../places';
import { lazyComponent } from './lazy';
import { OutlineFilterScope } from './outline-filter';
import { PanelBar, PanelFrame } from './panel-frame';
import type { PanelSide } from './panel-layout';
import { PanelSwitcher } from './panel-switcher';
import { ThumbnailList } from './thumbnail-list';

// Each feature's panel loads the first time it opens.
const SearchPanel = lazyComponent(() => import('./search-panel').then((ui) => ui.SearchPanel));
const FindBar = lazyComponent(() => import('./search-panel').then((ui) => ui.FindBar));
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
const OutlinePanel = lazyComponent(() => import('./outline-panel').then((ui) => ui.OutlinePanel));
const AttachmentsPanel = lazyComponent(() =>
  import('./attachments-panel').then((ui) => ui.AttachmentsPanel),
);
const FormDesignPanel = lazyComponent(() =>
  import('./form-design-panel').then((ui) => ui.FormDesignPanel),
);

/** What a built-in panel draws in its slot. */
interface BuiltInContent {
  readonly draw: (documentId: string | null) => ReactNode;
  /** It holds a list: in a sheet or an overlay, picking one of its items closes the panel. */
  readonly list?: boolean;
  /** Holds what its bar and its body share: around both. */
  readonly scope?: (props: { readonly children: ReactNode }) => ReactNode;
  /** What it draws instead, as a bar ({@link PanelBar}), while `when` says its list would be empty. */
  readonly bar?: {
    readonly when: (kernel: Kernel, documentId: string | null) => boolean;
    readonly draw: (documentId: string | null) => ReactNode;
  };
}

const BUILT_IN_CONTENT: ReadonlyMap<string, BuiltInContent> = new Map<string, BuiltInContent>([
  ['thumbnails', { draw: () => <ThumbnailList />, list: true }],
  // Each document's own outline and its rows; the filter its bar and its rows share.
  [
    'outline',
    {
      draw: (documentId) => <OutlinePanel key={documentId ?? 'none'} />,
      list: true,
      scope: OutlineFilterScope,
    },
  ],
  // Each document's files: its attachments and the files on its pages.
  [
    'attachments',
    { draw: (documentId) => <AttachmentsPanel key={documentId ?? 'none'} />, list: true },
  ],
  // These read the document as they mount, so each document gets its own.
  [
    'search',
    {
      draw: (documentId) => <SearchPanel key={documentId ?? 'none'} />,
      list: true,
      // Without snippets (copying isn't allowed) every hit would be a blank row.
      bar: {
        when: (kernel, documentId) =>
          kernel
            .tryCapability(SearchToken, documentId ?? undefined)
            ?.canSearch({ snippets: true }) === false,
        draw: (documentId) => <FindBar key={documentId ?? 'none'} />,
      },
    },
  ],
  ['comments', { draw: (documentId) => <CommentsPanel key={documentId ?? 'none'} /> }],
  ['measurement', { draw: (documentId) => <MeasurementSection key={documentId ?? 'none'} /> }],
  ['style', { draw: () => <AnnotationStylePanel /> }],
  ['stamps', { draw: () => <StampsPanel /> }],
  ['signatures', { draw: () => <SignaturesPanel /> }],
  ['redaction', { draw: () => <RedactionPanel /> }],
  // The form's fields and their settings: each document's own.
  ['form-design', { draw: (documentId) => <FormDesignPanel key={documentId ?? 'none'} /> }],
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
  const content = BUILT_IN_CONTENT.get(id);
  const bar = useKernelValue((kernel) => content?.bar?.when(kernel, documentId) === true);
  if (!panel) return null;
  const title = panel.title ?? (panel.titleKey !== undefined ? t(panel.titleKey) : id);
  if (bar) {
    return (
      <PanelBar id={id} side={side} title={title} onClose={() => shell?.close(id)}>
        <slot name={`panel:${id}`}>{content?.bar?.draw(documentId)}</slot>
      </PanelBar>
    );
  }
  const Scope = content?.scope ?? Fragment;
  return (
    <Scope>
      <PanelFrame
        id={id}
        side={side}
        present={panel.present}
        width={panel.width}
        resizable={panel.resizable}
        title={title}
        header={
          siblings.length > 1 ? (
            <PanelSwitcher id={id} title={title} panels={siblings} />
          ) : undefined
        }
        bars={<PanelBars panel={id} />}
        list={content?.list}
        onClose={() => shell?.close(id)}
      >
        <slot name={`panel:${id}`}>{content?.draw(documentId)}</slot>
      </PanelFrame>
    </Scope>
  );
}
