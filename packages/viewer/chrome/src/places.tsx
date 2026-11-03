/**
 * The layout's places, drawn: the bars along each edge of the viewer, the bars
 * floating over the pages, and the bars at the top of a panel.
 *
 * An edge's bars stack from the outside in, each followed by the bars that ride
 * along it on the side of the pages. Bars at `start` and `end` are vertical and
 * follow the viewer's direction (the `dir` on its root), so they swap sides in
 * a right-to-left language. A floating bar draws as a pill around its items,
 * over the pages and under the bars over a selection; the bars floating on one
 * edge share it without covering each other (`ui/floating-row.ts`). Each bar
 * tells what opens from it where it is ({@link BarEdgeProvider}). A bar with
 * nothing visible draws nothing, and a bar with a mode shows while that mode is
 * open. A floating bar rests out of sight while nothing moves as its place
 * says (`ui/idle-hiding.ts`). A panel's bars sit under its title, each in a
 * band across the panel.
 */
import {
  barsInPanel,
  commandOfUnit,
  edgeStackOf,
  floatStackOf,
  hasVisibleUnits,
  hideWhenIdleOf,
  hostOf,
  modeCommandOf,
  normalizeBar,
  type BarEdge as LayoutEdge,
  type BarSchema,
  type FloatPosition,
  type SectionName,
} from '@embedpdf/core-ui';
import { useCommands } from '@embedpdf/react/commands';
import { useDocumentId, useKernelValue, useOptionalSelector } from '@embedpdf/react/runtime';
import { ShellToken } from '@embedpdf/react/shell';
import { isolatePointerDown, observeHeight, observeWidth } from '@embedpdf/web';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { openModeSurfaceOf } from './config/modes';
import { useResolvedLayout } from './config-context';
import { BarEdgeProvider, type BarEdge } from './ui/bar-edge';
import { useHiddenWhenIdle } from './ui/compact';
import {
  FLOATING_ROWS,
  arrangeEdgeRow,
  arrangeSideRow,
  type FloatingColumn,
  type FloatingRowName,
  type FloatingSpot,
} from './ui/floating-row';
import { hidesWhenIdle } from './ui/idle-hiding';
import { AppToolbar, barPartOf } from './ui/toolbar';

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

/** The bars of `stack` that show now: a bar without a mode, or one whose mode is open. */
function useShownBars(stack: readonly string[]): string[] {
  const { data } = useResolvedLayout();
  const openMode = useOptionalSelector(ShellToken, openModeSurfaceOf, null);
  return stack.filter((id) => {
    const mode = data.bars?.[id]?.mode;
    return mode === undefined || openMode === modeCommandOf(mode);
  });
}

// ── the edges ────────────────────────────────────────────────────────────────

/** The line between a bar and the pages: on its inner side. */
const INNER_BORDER: Record<LayoutEdge, string> = {
  top: 'border-b',
  bottom: 'border-t',
  start: 'border-e',
  end: 'border-s',
};

/** One bar along an edge: its toolbar in a band, or nothing when nothing in it is visible. */
function EdgeBar({ id, edge, rides }: { id: string; edge: LayoutEdge; rides: boolean }) {
  const bar = useResolvedLayout().bar(id);
  const shows = useBarShows(bar);
  if (!bar || !shows) return null;
  const vertical = edge === 'start' || edge === 'end';
  return (
    <BarEdgeProvider value={edge}>
      <div
        // Every bar is the `toolbar` part, and `toolbar-<id>`, which page CSS reaches through
        // `::part()`.
        part={barPartOf(id)}
        data-bar={id}
        className={`border-border flex shrink-0 ${
          vertical ? 'flex-col px-2 py-4' : 'items-center px-4 py-2'
        } ${rides ? 'bg-surface-alt' : 'bg-surface'} ${INNER_BORDER[edge]}`}
      >
        <AppToolbar
          bar={bar}
          orientation={vertical ? 'vertical' : 'horizontal'}
          className={vertical ? 'min-h-0 flex-1' : 'w-full'}
        />
      </div>
    </BarEdgeProvider>
  );
}

/**
 * The bars along one edge, from the outside in, each followed by the bars riding along it. The
 * outside comes first in the document on the top and start edges, and last on the bottom and end.
 */
export function EdgeBars({ edge }: { edge: LayoutEdge }) {
  const { data } = useResolvedLayout();
  const stack = useShownBars(useMemo(() => edgeStackOf(data, edge), [data, edge]));
  const ordered = edge === 'top' || edge === 'start' ? stack : [...stack].reverse();
  return (
    <>
      {ordered.map((id) => (
        <EdgeBar key={id} id={id} edge={edge} rides={hostOf(data.bars?.[id]?.place) !== null} />
      ))}
    </>
  );
}

// ── over the pages ───────────────────────────────────────────────────────────

/** Where a floating bar's items sit across the pages: its section of a one-section bar. */
const ALIGN_OF: Record<FloatPosition, SectionName> = {
  'top-start': 'start',
  top: 'center',
  'top-end': 'end',
  start: 'start',
  end: 'end',
  'bottom-start': 'start',
  bottom: 'center',
  'bottom-end': 'end',
};

/** The toolbar's sections, in the order the headless toolbar draws them. */
const SECTION_ORDER: readonly SectionName[] = ['start', 'center', 'end'];

/**
 * A floating bar opens its menus toward the other half of the viewer; one in the middle of a side
 * opens them downward.
 */
const edgeOfFloat = (position: FloatPosition): BarEdge =>
  position.startsWith('bottom') ? 'float-bottom' : 'float-top';

/** `bar` with all its groups, in order, in one section. */
function inOneSection(bar: BarSchema, section: SectionName): BarSchema {
  const groups = [
    ...(bar.sections.start ?? []),
    ...(bar.sections.center ?? []),
    ...(bar.sections.end ?? []),
  ];
  return { id: bar.id, sections: { [section]: groups } };
}

/** Hears the width of each floating bar's pill in a column: `null` once it draws nothing. */
type PillWidthReport = (id: string, width: number | null) => void;

const PillWidthContext = createContext<PillWidthReport>(() => {});

/**
 * One floating bar. Its toolbar spans its lane in the row, so it fits what there is, and holds
 * the bar in the one section that puts it where it floats; the `float-pill` variant (styles.css)
 * draws that section as the pill, whose width it reports to its column. Presses on the bar stay
 * off the pages.
 */
function FloatingBar({ id, position }: { id: string; position: FloatPosition }) {
  const { data, bar: barOf } = useResolvedLayout();
  const bar = barOf(id);
  const shows = useBarShows(bar);
  const placed = useMemo(
    () => (bar ? inOneSection(bar, ALIGN_OF[position]) : null),
    [bar, position],
  );
  const lane = useRef<HTMLDivElement>(null);
  const drawn = placed !== null && shows;
  useEffect(() => (drawn && lane.current ? isolatePointerDown(lane.current) : undefined), [drawn]);
  const hidden = useHiddenWhenIdle(drawn && hidesWhenIdle(hideWhenIdleOf(data, id), bar), lane);
  const reportPillWidth = useContext(PillWidthContext);
  // The pill, the bar's `toolbar` part, is the section of the toolbar that holds the bar. The
  // headless toolbar draws its sections first, in order and without attributes of ours, and
  // keeps the same elements while it's there: naming them once it has drawn them is enough.
  useLayoutEffect(() => {
    let pill: Element | null = null;
    const sections = lane.current?.querySelectorAll(':scope > [role="toolbar"] > div');
    sections?.forEach((section, index) => {
      if (SECTION_ORDER[index] === ALIGN_OF[position]) {
        section.setAttribute('part', barPartOf(id));
        pill = section;
      } else section.removeAttribute('part');
    });
    if (pill === null) return undefined;
    const stop = observeWidth(pill, (width) => reportPillWidth(id, width));
    return () => {
      stop();
      reportPillWidth(id, null);
    };
  }, [drawn, position, id, reportPillWidth]);
  if (!drawn) return null;
  return (
    <BarEdgeProvider value={edgeOfFloat(position)}>
      <div
        ref={lane}
        data-bar={id}
        data-idle-hidden={hidden ? '' : undefined}
        className="flex w-full"
      >
        <AppToolbar
          bar={placed}
          className="float-pill:pointer-events-auto float-pill:rounded-lg float-pill:border float-pill:border-border-subtle float-pill:bg-elevated/95 float-pill:p-0.5 float-pill:shadow-lg pointer-events-none w-full"
        />
      </div>
    </BarEdgeProvider>
  );
}

/** Px between two floating bars: one over the other in a column, and side by side in a row. */
const FLOATING_GAP_PX = 8;

/** How far in from the edges of the pages the floating bars keep: clear of their 12 px scrollbars. */
const FLOATING_INSET_PX = 20;

const ROW_NAMES: readonly FloatingRowName[] = ['top', 'sides', 'bottom'];

/** The three places of a row. */
type RowSlot = 'start' | 'middle' | 'end';

const ROW_SLOTS: readonly RowSlot[] = ['start', 'middle', 'end'];

/**
 * Where a column sits across the pages: on its edge's line, or between the top and bottom ones
 * on the sides, centered. No transform: it would hold the fixed layers of the menus that open
 * from the bars.
 */
const COLUMN_STYLE: Record<FloatingRowName, CSSProperties> = {
  top: { top: FLOATING_INSET_PX },
  sides: {
    top: FLOATING_INSET_PX,
    bottom: FLOATING_INSET_PX,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  bottom: { bottom: FLOATING_INSET_PX },
};

/**
 * The side of a column its `offset` goes on: in from its edge on the top and bottom rows; on the
 * sides, the room left for the other column, below the start one and above the end one.
 */
const offsetSideOf = (row: FloatingRowName, slot: RowSlot): 'paddingTop' | 'paddingBottom' =>
  row === 'top' || (row === 'sides' && slot === 'end') ? 'paddingTop' : 'paddingBottom';

/** The bars floating over the pages, row by row; one empty line across the rows measures them. */
export function FloatingBars() {
  const row = useRef<HTMLDivElement>(null);
  const [length, setLength] = useState(0);
  useLayoutEffect(() => (row.current ? observeWidth(row.current, setLength) : undefined), []);
  return (
    <>
      <div
        ref={row}
        aria-hidden
        className="pointer-events-none absolute top-0 h-0"
        style={{ insetInlineStart: FLOATING_INSET_PX, insetInlineEnd: FLOATING_INSET_PX }}
      />
      {ROW_NAMES.map((name) => (
        <FloatingRow key={name} row={name} length={length} />
      ))}
    </>
  );
}

const NO_COLUMNS: Readonly<Record<RowSlot, FloatingColumn | null>> = {
  start: null,
  middle: null,
  end: null,
};

const sameColumn = (left: FloatingColumn | null, right: FloatingColumn | null): boolean =>
  left === right ||
  (left !== null &&
    right !== null &&
    Math.abs(left.width - right.width) <= 0.5 &&
    Math.abs(left.height - right.height) <= 0.5);

/** One row of floating positions: each column where `ui/floating-row.ts` puts it. */
function FloatingRow({ row, length }: { row: FloatingRowName; length: number }) {
  const { data } = useResolvedLayout();
  const positions = FLOATING_ROWS[row];
  const [columns, setColumns] = useState(NO_COLUMNS);
  const reportColumn = useCallback(
    (slot: RowSlot, column: FloatingColumn | null) =>
      setColumns((previous) =>
        sameColumn(previous[slot], column) ? previous : { ...previous, [slot]: column },
      ),
    [],
  );
  const arrange = row === 'sides' ? arrangeSideRow : arrangeEdgeRow;
  const spots = arrange({ length, gap: FLOATING_GAP_PX, ...columns });
  return (
    <>
      {ROW_SLOTS.map((slot) => {
        const position = positions[slot];
        if (position === null) return null;
        return (
          <FloatingColumnAt
            key={position}
            row={row}
            slot={slot}
            position={position}
            stack={floatStackOf(data, position)}
            spot={spots[slot]}
            onColumn={reportColumn}
          />
        );
      })}
    </>
  );
}

/**
 * The bars floating at one position, one over the other, in the lane and at the offset its row
 * gives it; it tells the row how wide its widest pill is and how tall it is.
 */
function FloatingColumnAt({
  row,
  slot,
  position,
  stack,
  spot,
  onColumn,
}: {
  row: FloatingRowName;
  slot: RowSlot;
  position: FloatPosition;
  stack: readonly string[];
  spot: FloatingSpot;
  onColumn: (slot: RowSlot, column: FloatingColumn | null) => void;
}) {
  const shown = useShownBars(stack);
  const column = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [widths, setWidths] = useState<ReadonlyMap<string, number>>(() => new Map());
  const reportPillWidth = useCallback<PillWidthReport>(
    (id, width) =>
      setWidths((previous) => {
        const known = previous.get(id);
        if (
          width === null
            ? known === undefined
            : known !== undefined && Math.abs(known - width) <= 0.5
        )
          return previous;
        const next = new Map(previous);
        if (width === null) next.delete(id);
        else next.set(id, width);
        return next;
      }),
    [],
  );
  const drawn = stack.length > 0;
  useLayoutEffect(
    () => (drawn && column.current ? observeHeight(column.current, setHeight) : undefined),
    [drawn],
  );
  const width = Math.max(0, ...widths.values());
  useLayoutEffect(() => {
    onColumn(slot, width > 0 ? { width, height } : null);
  }, [onColumn, slot, width, height]);
  useLayoutEffect(() => () => onColumn(slot, null), [onColumn, slot]);
  if (!drawn) return null;
  const style: CSSProperties = {
    ...COLUMN_STYLE[row],
    insetInlineStart: FLOATING_INSET_PX + spot.insetStart,
    insetInlineEnd: FLOATING_INSET_PX + spot.insetEnd,
    [offsetSideOf(row, slot)]: spot.offset,
  };
  return (
    <div data-float={position} className="pointer-events-none absolute" style={style}>
      <div
        ref={column}
        className={`flex gap-2 ${row === 'bottom' ? 'flex-col-reverse' : 'flex-col'}`}
      >
        <PillWidthContext.Provider value={reportPillWidth}>
          {shown.map((id) => (
            <FloatingBar key={id} id={id} position={position} />
          ))}
        </PillWidthContext.Provider>
      </div>
    </div>
  );
}

// ── at the top of a panel ────────────────────────────────────────────────────

/** One bar at the top of a panel: its toolbar in a band, or nothing when nothing in it is visible. */
function BarInPanel({ id }: { id: string }) {
  const bar = useResolvedLayout().bar(id);
  const shows = useBarShows(bar);
  if (!bar || !shows) return null;
  // Under the panel's title, so what opens from it opens downward, as from a bar at the top.
  return (
    <BarEdgeProvider value="top">
      <div
        part={barPartOf(id)}
        data-bar={id}
        className="border-border-subtle flex shrink-0 items-center border-b p-2"
      >
        {/* As close together as a panel's own rows of buttons (gap-1). */}
        <AppToolbar bar={bar} gap={4} className="w-full" />
      </div>
    </BarEdgeProvider>
  );
}

/** The bars at the top of a panel, in the order they were added. */
export function PanelBars({ panel }: { panel: string }) {
  const { data } = useResolvedLayout();
  const stack = useShownBars(useMemo(() => barsInPanel(data, panel), [data, panel]));
  return (
    <>
      {stack.map((id) => (
        <BarInPanel key={id} id={id} />
      ))}
    </>
  );
}
