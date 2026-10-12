/**
 * The DOM half of a toolbar that folds to fit: measuring. A hidden layer
 * renders every unit in every variant (and each group's folded forms, and the
 * "More" button); each element there reports its length here, live, so a new
 * language, a font loading, browser zoom and your CSS all re-measure on their
 * own. A length runs along the toolbar: a width when it is horizontal, a
 * height when it is vertical. The lengths become the fit metrics core-ui's
 * `solve()` takes (the structural twin, {@link ToolbarFitMetrics}); the
 * adapter renders what the solve decides.
 */
import type { Orientation } from './orientation';

/** The keys the measurement layer reports lengths under, the ones the metrics look up. */
export const toolbarMeasureKey = {
  /** A unit (`NormalizedUnit.key`) at one variant. */
  unit: (unitKey: string, variant: string): string => `u:${unitKey}@${variant}`,
  /** A group in its collapsed form. */
  group: (groupId: string): string => `g:${groupId}`,
  /** A shed group's disclosure trigger, measured with the whole group behind it. */
  groupTrigger: (groupId: string): string => `gt:${groupId}`,
  /** The "More" button. */
  overflowTrigger: 't:',
} as const;

/** The lengths a fit needs: the structural twin of core-ui's `FitMetrics`. */
export interface ToolbarFitMetrics {
  unit(key: string, variant: string): number | undefined;
  groupCollapsed(groupId: string): number | undefined;
  groupTrigger(groupId: string): number | undefined;
  readonly overflowTrigger: number;
  readonly gap: number;
  readonly separator: number;
}

/**
 * The measured lengths of one toolbar, kept apart per orientation: a toolbar
 * turned on its side never fits with the other axis's numbers.
 */
export interface ToolbarLengths {
  /**
   * A measured element's length along `orientation`, under its
   * {@link toolbarMeasureKey}. True when it changed by more than half a pixel:
   * render (and solve) again.
   */
  report(orientation: Orientation, key: string, length: number): boolean;
  /**
   * The lengths along `orientation` as fit metrics, for items `gap` px apart
   * and separators `separatorWidth` px thick (a separator's width is its
   * thickness, across a horizontal bar or down a vertical one). A separator is
   * one more flex child: its thickness plus one gap. Until the "More" button
   * is measured it counts as 32 px.
   */
  metrics(orientation: Orientation, gap: number, separatorWidth: number): ToolbarFitMetrics;
}

export function createToolbarLengths(): ToolbarLengths {
  const byOrientation: Record<Orientation, Map<string, number>> = {
    horizontal: new Map(),
    vertical: new Map(),
  };
  return {
    report(orientation, key, length) {
      const lengths = byOrientation[orientation];
      const previous = lengths.get(key);
      if (previous !== undefined && Math.abs(previous - length) <= 0.5) return false;
      lengths.set(key, length);
      return true;
    },
    metrics(orientation, gap, separatorWidth) {
      const lengths = byOrientation[orientation];
      return {
        unit: (key, variant) => lengths.get(toolbarMeasureKey.unit(key, variant)),
        groupCollapsed: (groupId) => lengths.get(toolbarMeasureKey.group(groupId)),
        groupTrigger: (groupId) => lengths.get(toolbarMeasureKey.groupTrigger(groupId)),
        overflowTrigger: lengths.get(toolbarMeasureKey.overflowTrigger) ?? 32,
        gap,
        separator: separatorWidth + gap,
      };
    },
  };
}

// ── elements ─────────────────────────────────────────────────────────────────

/** Report one side of an element's border box now and whenever it resizes. */
function observeBorderBox(
  element: Element,
  side: 'width' | 'height',
  onLength: (length: number) => void,
): () => void {
  const report = () => onLength(element.getBoundingClientRect()[side]);
  report();
  const observer = new ResizeObserver(report);
  observer.observe(element);
  return () => observer.disconnect();
}

/**
 * Report an element's width (its border box) now and whenever it resizes. Put
 * it on every element of a horizontal toolbar's measurement layer, and on a
 * custom slot's `<slot>` socket, which is measured live where it renders.
 * Returns the detach.
 */
export function observeWidth(element: Element, onWidth: (width: number) => void): () => void {
  return observeBorderBox(element, 'width', onWidth);
}

/** {@link observeWidth} for a vertical toolbar: an element's border-box height. */
export function observeHeight(element: Element, onHeight: (height: number) => void): () => void {
  return observeBorderBox(element, 'height', onHeight);
}

/** An element's length along a toolbar: {@link observeWidth} or {@link observeHeight}. */
export function observeLength(
  element: Element,
  orientation: Orientation,
  onLength: (length: number) => void,
): () => void {
  return observeBorderBox(element, orientation === 'vertical' ? 'height' : 'width', onLength);
}

// ── the room a toolbar fills ─────────────────────────────────────────────────

/** Report one side of an element's content box now, then on changes over half a pixel. */
function observeContentBox(
  element: HTMLElement,
  side: 'width' | 'height',
  onLength: (length: number) => void,
): () => void {
  let last = side === 'width' ? element.clientWidth : element.clientHeight;
  onLength(last);
  const observer = new ResizeObserver((entries) => {
    const length = entries[entries.length - 1]?.contentRect[side];
    if (length === undefined || Math.abs(last - length) <= 0.5) return;
    last = length;
    onLength(length);
  });
  observer.observe(element);
  return () => observer.disconnect();
}

/**
 * Report the width a toolbar has to fill (its content box) now and whenever
 * it changes by more than half a pixel. Returns the detach.
 */
export function observeContentWidth(
  element: HTMLElement,
  onWidth: (width: number) => void,
): () => void {
  return observeContentBox(element, 'width', onWidth);
}

/**
 * The height a vertical toolbar has to fill, like {@link observeContentWidth}.
 * The toolbar fits the height it's given, so its container needs one.
 */
export function observeContentHeight(
  element: HTMLElement,
  onHeight: (height: number) => void,
): () => void {
  return observeContentBox(element, 'height', onHeight);
}

/** The room along a toolbar: {@link observeContentWidth} or {@link observeContentHeight}. */
export function observeContentLength(
  element: HTMLElement,
  orientation: Orientation,
  onLength: (length: number) => void,
): () => void {
  return observeContentBox(element, orientation === 'vertical' ? 'height' : 'width', onLength);
}
