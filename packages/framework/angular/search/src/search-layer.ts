/**
 * `<epdf-search-layer>`: the matches of the search on one page, highlighted. It makes no
 * engine calls; your search box drives the search through `inject(EpdfSearch)`.
 *
 * An upright match is a rounded box; a turned one is its true four corners. Both are placed
 * through the page context, in the colors of the plugin's `highlight` setting, which the
 * `--epdf-search-highlight`, `--epdf-search-highlight-active` and `--epdf-search-blend-mode`
 * CSS variables win over.
 *
 * Each painted line carries `data-epdf-search-hit`, and `data-active` on the active match's, for
 * tests (`EpdfSearchLayerHarness`) and your own CSS.
 *
 * Listen to `(hitClick)` and matches become clickable: it emits the match someone clicks, for
 * example for `search.goToHit($event)`. The press still reaches the page, so a drag that starts
 * on a match selects text, and only a click emits. Without a listener, matches are only paint
 * and the pointer goes straight through.
 */
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import {
  SEARCH_DEFAULTS,
  SearchToken,
  type SearchCapability,
  type SearchHit,
} from '@embedpdf/plugin-search';
import {
  createClickDetector,
  paint,
  searchHighlightsOf,
  type SearchHighlightPiece,
} from '@embedpdf/web';
import { CapabilityBinding, injectKernelHost, injectPage } from '@embedpdf/angular/runtime';

const NO_HITS: readonly SearchHit[] = Object.freeze([]);

@Component({
  selector: 'epdf-search-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pieces().length > 0) {
      <div style="position: absolute; inset: 0; pointer-events: none">
        @for (piece of pieces(); track piece.key) {
          @if (piece.box; as box) {
            <div
              data-epdf-search-hit
              style="position: absolute; border-radius: 2px"
              [attr.data-active]="piece.active || null"
              [style.left.px]="box.left"
              [style.top.px]="box.top"
              [style.width.px]="box.width"
              [style.height.px]="box.height"
              [style.background-color]="piece.fill"
              [style.mix-blend-mode]="blendMode()"
              [style.pointer-events]="clickable ? 'auto' : null"
              [style.cursor]="clickable ? 'pointer' : null"
              (pointerdown)="press($event)"
              (click)="click($event, piece.hit)"
            ></div>
          } @else {
            <svg
              style="position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible"
              [style.mix-blend-mode]="blendMode()"
            >
              <!-- The fill goes in style: an SVG attribute doesn't read var(). -->
              <polygon
                data-epdf-search-hit
                [attr.data-active]="piece.active || null"
                [attr.points]="piece.points"
                [style.fill]="piece.fill"
                [style.pointer-events]="clickable ? 'auto' : null"
                [style.cursor]="clickable ? 'pointer' : null"
                (pointerdown)="press($event)"
                (click)="click($event, piece.hit)"
              />
            </svg>
          }
        }
      </div>
    }
  `,
})
export class EpdfSearchLayer {
  private readonly clicks$ = new Subject<SearchHit>();
  /** A match was clicked (not dragged across): makes matches clickable while it's listened to. */
  readonly hitClick = outputFromObservable(this.clicks$);

  private readonly page = injectPage('<epdf-search-layer>');
  /** The search plugin of the page's own document. */
  private readonly search = new CapabilityBinding<SearchCapability>(
    injectKernelHost('<epdf-search-layer>'),
    () => SearchToken,
    () => this.page.documentId,
  );
  /** This page's matches: the plugin's own array, the same until matches land on this page. */
  private readonly hits = this.search.select(
    (search) => search.listHits({ page: this.page.ref }),
    NO_HITS,
    Object.is,
  );
  private readonly active = this.search.select((search) => search.getActiveHit(), null, Object.is);
  private readonly highlight = this.search.select(
    (search) => search.getSettings().highlight,
    SEARCH_DEFAULTS.highlight,
  );
  // Each color is its CSS variable first, then the setting: CSS wins.
  private readonly color = computed(() => paint('search-highlight', this.highlight().color));
  private readonly activeColor = computed(() =>
    paint('search-highlight-active', this.highlight().activeColor),
  );
  protected readonly blendMode = computed(() =>
    paint('search-blend-mode', this.highlight().blendMode),
  );

  /** One painted piece per line of each match: a box when upright, a polygon when turned. */
  protected readonly pieces = computed((): readonly SearchHighlightPiece<SearchHit>[] =>
    searchHighlightsOf(this.hits(), {
      active: this.active(),
      page: this.page.transform(),
      color: this.color(),
      activeColor: this.activeColor(),
    }),
  );

  /** Tells a click on a match from a drag that starts there (and selects text). */
  private readonly clickDetector = createClickDetector();

  /** Whether `(hitClick)` is listened to: only then do matches take the pointer. */
  protected get clickable(): boolean {
    return this.clicks$.observed;
  }

  protected press(event: PointerEvent): void {
    // Nothing stops the press: it reaches the page as well.
    if (this.clickable) this.clickDetector.press(event);
  }

  protected click(event: MouseEvent, hit: SearchHit): void {
    if (this.clickable && this.clickDetector.isClick(event)) this.clicks$.next(hit);
  }
}
