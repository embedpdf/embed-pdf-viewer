/**
 * The DOM half of a toolbar that folds to fit: measuring. A hidden layer
 * renders every unit in every variant (and each group's folded forms, and the
 * "More" button); each element there reports its width here, live, so a new
 * language, a font loading, browser zoom and your CSS all re-measure on their
 * own. The widths become the fit metrics core-ui's `solve()` takes (the
 * structural twin, {@link ToolbarFitMetrics}); the adapter renders what the
 * solve decides.
 */

/** The keys the measurement layer reports widths under, the ones the metrics look up. */
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

/** The widths a fit needs: the structural twin of core-ui's `FitMetrics`. */
export interface ToolbarFitMetrics {
  unit(key: string, variant: string): number | undefined;
  groupCollapsed(groupId: string): number | undefined;
  groupTrigger(groupId: string): number | undefined;
  readonly overflowTrigger: number;
  readonly gap: number;
  readonly separator: number;
}

/** The measured widths of one toolbar. */
export interface ToolbarWidths {
  /**
   * A measured element's width, under its {@link toolbarMeasureKey}. True when
   * it changed by more than half a pixel: render (and solve) again.
   */
  report(key: string, width: number): boolean;
  /**
   * The widths as fit metrics, for items `gap` px apart and separators
   * `separatorWidth` px wide. A separator is one more flex child: its width
   * plus one gap. Until the "More" button is measured it counts as 32 px.
   */
  metrics(gap: number, separatorWidth: number): ToolbarFitMetrics;
}

export function createToolbarWidths(): ToolbarWidths {
  const widths = new Map<string, number>();
  return {
    report(key, width) {
      const previous = widths.get(key);
      if (previous !== undefined && Math.abs(previous - width) <= 0.5) return false;
      widths.set(key, width);
      return true;
    },
    metrics: (gap, separatorWidth) => ({
      unit: (key, variant) => widths.get(toolbarMeasureKey.unit(key, variant)),
      groupCollapsed: (groupId) => widths.get(toolbarMeasureKey.group(groupId)),
      groupTrigger: (groupId) => widths.get(toolbarMeasureKey.groupTrigger(groupId)),
      overflowTrigger: widths.get(toolbarMeasureKey.overflowTrigger) ?? 32,
      gap,
      separator: separatorWidth + gap,
    }),
  };
}

/**
 * Report an element's width (its border box) now and whenever it resizes. Put
 * it on every element of the measurement layer, and on a custom slot's
 * `<slot>` socket, which is measured live where it renders. Returns the
 * detach.
 */
export function observeWidth(element: Element, onWidth: (width: number) => void): () => void {
  const report = () => onWidth(element.getBoundingClientRect().width);
  report();
  const observer = new ResizeObserver(report);
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
  let last = element.clientWidth;
  onWidth(last);
  const observer = new ResizeObserver((entries) => {
    const width = entries[entries.length - 1]?.contentRect.width;
    if (width === undefined || Math.abs(last - width) <= 0.5) return;
    last = width;
    onWidth(width);
  });
  observer.observe(element);
  return () => observer.disconnect();
}
