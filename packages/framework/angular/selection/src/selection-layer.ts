/**
 * `<epdf-selection-layer>`: the highlight of the selected text on one page. It only draws: the
 * pointer goes to the interaction plugin (the Stage and the page view pass it on), and the
 * selection plugin decides what is selected.
 *
 * Each selected line is a polygon of its four corners, placed through the page context, so
 * turned text and turned pages are drawn exactly. The color is the plugin's `color` setting,
 * the viewer's accent at 35% while it's unset, and the `--epdf-text-selection` CSS variable
 * wins over both.
 */
import { ChangeDetectionStrategy, Component, computed, effect, untracked } from '@angular/core';
import {
  SelectionToken as SelectionHostToken,
  type SelectionHostCapability,
  type SelectionSegment,
} from '@embedpdf/plugin-selection/contract/host';
import { mixAccent, paint, quadInPixels, svgPoints } from '@embedpdf/web';
import { CapabilityBinding, injectKernelHost, injectPage } from '@embedpdf/angular/runtime';

const NO_SEGMENTS: readonly SelectionSegment[] = Object.freeze([]);

@Component({
  selector: 'epdf-selection-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible() && polygons().length > 0) {
      <svg
        style="position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none"
      >
        @for (points of polygons(); track $index) {
          <!-- The fill goes in style: an SVG attribute doesn't read var(). -->
          <polygon [attr.points]="points" [style.fill]="fill()" />
        }
      </svg>
    }
  `,
})
export class EpdfSelectionLayer {
  private readonly page = injectPage('<epdf-selection-layer>');
  private readonly host = injectKernelHost('<epdf-selection-layer>');
  /** The selection plugin of the page's own document, with what layers need of it. */
  private readonly selection = new CapabilityBinding<SelectionHostCapability>(
    this.host,
    () => SelectionHostToken,
    () => this.page.documentId,
  );

  /** This page's selected lines: the same array until the selection on this page changes. */
  private readonly segments = this.selection.select(
    (selection) => selection.listSegments(this.page.ref),
    NO_SEGMENTS,
  );
  /** False while something else draws the selection itself (a highlighter's preview). */
  protected readonly visible = this.selection.select(
    (selection) => selection.isHighlightVisible(),
    true,
  );
  private readonly color = this.selection.select(
    (selection) => selection.getSettings().color,
    null,
  );

  /** Each line's corners in the page's pixels, which turn with the page. */
  protected readonly polygons = computed(() => {
    const transform = this.page.transform();
    return this.segments().map((segment) => svgPoints(quadInPixels(segment.quad, transform)));
  });
  /** The CSS variable, then the setting, then the accent (with its own variable) at 35%. */
  protected readonly fill = computed(() =>
    paint(
      'text-selection',
      this.color() ?? mixAccent('text-selection', this.host.viewerSettings().accent),
    ),
  );

  constructor() {
    // Read the page's text geometry as soon as the page is shown, so the first press can find
    // the text under it at once. Without permission to select, nothing is read.
    effect(() => {
      const selection = this.selection.capability();
      const page = this.page.ref;
      if (selection) untracked(() => void selection.ensureLoaded(page));
    });
  }
}
