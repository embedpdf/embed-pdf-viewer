/**
 * The layout's places, drawn: the bars along each edge of the viewer, and the
 * bars floating over the pages.
 *
 * An edge's bars stack from the outside in, each followed by the bars that ride
 * along it on the side of the pages. Bars at `start` and `end` are vertical and
 * follow the viewer's direction (the `dir` on its root), so they swap sides in
 * a right-to-left language. A floating bar draws as a pill around its items,
 * over the pages and under the bars over a selection. Each bar tells what opens
 * from it where it is ({@link BarEdgeProvider}). A bar with nothing visible
 * draws nothing, and a bar with a mode shows while that mode is open.
 */
import {
  FLOAT_POSITIONS,
  commandOfUnit,
  edgeStackOf,
  floatStackOf,
  hasVisibleUnits,
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
import { isolatePointerDown } from '@embedpdf/web';
import { useEffect, useMemo, useRef } from 'react';

import { openModeSurfaceOf } from './config/modes';
import { useResolvedLayout } from './config-context';
import { BarEdgeProvider, type BarEdge } from './ui/bar-edge';
import { AppToolbar } from './ui/toolbar';

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
        // `toolbar` is the main bar's part name, which page CSS reaches.
        part={id === 'main' ? 'toolbar' : undefined}
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

/**
 * Where the bars floating at a position stack: 20 px in from the edges of the pages, which clears
 * their 12 px scrollbars; the first bar is nearest the edge, the bars riding along it inside it.
 * No transform: it would hold the fixed layers of the menus that open from the bars.
 */
const STACK_CLASS: Record<FloatPosition, string> = {
  'top-start': 'top-5 flex-col',
  top: 'top-5 flex-col',
  'top-end': 'top-5 flex-col',
  start: 'inset-y-5 flex-col justify-center',
  end: 'inset-y-5 flex-col justify-center',
  'bottom-start': 'bottom-5 flex-col-reverse',
  bottom: 'bottom-5 flex-col-reverse',
  'bottom-end': 'bottom-5 flex-col-reverse',
};

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

/**
 * One floating bar. Its toolbar spans the room across the pages, so it fits what there is, and
 * holds the bar in the one section that puts it where it floats; the `float-pill` variant
 * (styles.css) draws that section as the pill. Presses on the bar stay off the pages.
 */
function FloatingBar({ id, position }: { id: string; position: FloatPosition }) {
  const bar = useResolvedLayout().bar(id);
  const shows = useBarShows(bar);
  const placed = useMemo(
    () => (bar ? inOneSection(bar, ALIGN_OF[position]) : null),
    [bar, position],
  );
  const lane = useRef<HTMLDivElement>(null);
  const drawn = placed !== null && shows;
  useEffect(() => (drawn && lane.current ? isolatePointerDown(lane.current) : undefined), [drawn]);
  if (!drawn) return null;
  return (
    <BarEdgeProvider value={edgeOfFloat(position)}>
      <div ref={lane} data-bar={id} className="flex w-full">
        <AppToolbar
          bar={placed}
          className="float-pill:pointer-events-auto float-pill:rounded-full float-pill:border float-pill:border-border-subtle float-pill:bg-elevated/95 float-pill:p-0.5 float-pill:shadow-lg pointer-events-none w-full"
        />
      </div>
    </BarEdgeProvider>
  );
}

/** The bars floating over the pages, stacked at each of their positions. */
export function FloatingBars() {
  const { data } = useResolvedLayout();
  const stacks = useMemo(
    () =>
      FLOAT_POSITIONS.map((position) => ({ position, stack: floatStackOf(data, position) })).filter(
        ({ stack }) => stack.length > 0,
      ),
    [data],
  );
  return (
    <>
      {stacks.map(({ position, stack }) => (
        <FloatingStack key={position} position={position} stack={stack} />
      ))}
    </>
  );
}

function FloatingStack({ position, stack }: { position: FloatPosition; stack: readonly string[] }) {
  const shown = useShownBars(stack);
  if (shown.length === 0) return null;
  return (
    <div
      data-float={position}
      className={`pointer-events-none absolute inset-x-5 flex gap-2 ${STACK_CLASS[position]}`}
    >
      {shown.map((id) => (
        <FloatingBar key={id} id={id} position={position} />
      ))}
    </div>
  );
}
