/**
 * Anchored UI: one element for everything that floats next to something on a page, such as a
 * menu over a selection, a badge under a stamp or a card over a hovered note.
 *
 *   <epdf-stage>
 *     <epdf-anchored [anchor]="{ page: hit.page, bounds: hit.bounds }" placement="bottom">…
 *
 * The page surface (a Stage, a standalone page view) provides an `EpdfProjectorBinding`: how
 * a box on a page lands in the surface, and a `revision` signal that changes whenever that may
 * have changed. The placement math is `@embedpdf/web`'s, shared by every framework.
 *
 * It renders in the surface's own box, so it moves in the same change detection pass as the
 * pages and never trails a scroll by a frame, as an overlay outside the Stage would.
 * On a page that isn't shown it renders nothing and doesn't follow the camera at all.
 */
import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
  type Signal,
} from '@angular/core';
import { outsideStageError } from '@embedpdf/angular/runtime';
import {
  observeAnchoredFit,
  projectAnchoredTarget,
  sameAnchoredFit,
  type AnchoredFit,
  type AnchoredPlacement,
  type AnchoredRect,
  type AnchorTarget,
  type ViewProjector,
} from '@embedpdf/web';

/** What a page surface gives the anchored UI inside it. */
export interface EpdfProjectorBinding {
  /** How a box on a page lands in the surface; null while there is nothing to project onto. */
  readonly projector: Signal<ViewProjector | null>;
  /**
   * Changes whenever the projection may have (the Stage's camera): anchored UI reads it, so it
   * moves in the same pass as the pages.
   */
  readonly revision: Signal<unknown>;
  /** The pages on screen, by object number; null when the surface shows a single page. */
  readonly shownPages: Signal<ReadonlySet<number> | null>;
  /**
   * For a surface that moves with the browser rather than with state (a page view scrolled with
   * the document): call `callback` after such a move. A Stage has none.
   */
  readonly subscribe?: (callback: () => void) => () => void;
}

/** Provided by page surfaces (`<epdf-stage>`, a standalone page view), not by app code. */
export const EPDF_PROJECTOR = new InjectionToken<EpdfProjectorBinding>('EPDF_PROJECTOR');

/** Where anchored UI sits: next to a box on a page, and points it keeps clear of. */
export type EpdfAnchor = Omit<AnchorTarget, 'bounds'> & { bounds?: AnchoredRect | null };

/**
 * Its content, placed next to a box on a page. Once the content's size is measured it flips to
 * the other side when the chosen one has no room, and stays inside the view, unless `pinned`.
 * A pointer press inside it doesn't reach the page under it, so a click in a menu is never a
 * click outside the selection.
 */
@Component({
  selector: 'epdf-anchored',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (position(); as position) {
      <div
        #box
        style="width: max-content; pointer-events: auto"
        [style.position]="space() === 'client' ? 'fixed' : 'absolute'"
        [style.left.px]="position.left"
        [style.top.px]="position.top"
        [style.transform]="position.transform"
        (pointerdown)="$event.stopPropagation()"
      >
        <ng-content />
      </div>
    }
  `,
})
export class EpdfAnchored {
  /**
   * The box on a page to sit next to, in page coordinates: `{ page, bounds }`, with `avoid`
   * points to keep clear of. Null, or no `bounds` (a search match without a box), hides it.
   */
  readonly anchor = input<EpdfAnchor | null | undefined>(null);
  /** A side of the box, centred, or lined up with that side's start or end (`'top-end'`). */
  readonly placement = input<AnchoredPlacement>('top');
  /** Screen pixels between the box and the content, and between the content and the view's edge. */
  readonly gap = input(8);
  /**
   * Stay where `placement` puts it: never flip, never move to stay in view, and scroll away with
   * the box. For badges and status; menus leave it off.
   */
  readonly pinned = input(false, { transform: booleanAttribute });

  private readonly binding: EpdfProjectorBinding;
  /** The content's size and the view's, measured once it's shown and again when either resizes. */
  private readonly fit = signal<AnchoredFit | null>(null);
  /** Moves the browser made that no state announces (a page view scrolled with the document). */
  private readonly moved = signal(0);
  private readonly box = viewChild<ElementRef<HTMLDivElement>>('box');

  protected readonly space = computed(() => this.binding.projector()?.space ?? 'overlay');

  /** Whether its page is on screen: until it is, nothing below reads the camera. */
  private readonly onShownPage = computed(() => {
    const anchor = this.anchor();
    if (!anchor?.bounds) return false;
    const shown = this.binding.shownPages();
    return !shown || shown.has(anchor.page.objectNumber);
  });

  protected readonly position = computed(() => {
    if (!this.onShownPage()) return null;
    this.binding.revision();
    this.moved();
    const projector = this.binding.projector();
    const anchor = this.anchor();
    if (!projector || !anchor?.bounds) return null;
    return projectAnchoredTarget(
      projector,
      { ...anchor, bounds: anchor.bounds },
      { placement: this.placement(), gap: this.gap(), pinned: this.pinned() },
      this.fit(),
    );
  });

  constructor() {
    const binding = inject(EPDF_PROJECTOR, { optional: true });
    if (!binding) throw outsideStageError('<epdf-anchored>');
    this.binding = binding;
    const injector = inject(Injector);

    if (binding.subscribe) {
      const subscribe = binding.subscribe;
      effect((onCleanup) => {
        if (!this.onShownPage()) return;
        onCleanup(subscribe(() => this.moved.update((count) => count + 1)));
      });
    }

    // A surface in client space measures the DOM, which isn't there on the first pass: one
    // more pass once it is.
    effect(() => {
      if (this.space() !== 'client' || !this.anchor()) return;
      afterNextRender(() => this.moved.update((count) => count + 1), { injector });
    });

    effect((onCleanup) => {
      const element = this.box()?.nativeElement;
      if (!element) return;
      const space = this.space();
      onCleanup(
        observeAnchoredFit(element, space, (next) => {
          if (!sameAnchoredFit(untracked(this.fit), next)) this.fit.set(next);
        }),
      );
    });
  }
}
