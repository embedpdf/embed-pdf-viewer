import {
  ChangeDetectionStrategy,
  Component,
  effect,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import {
  EpdfPageChrome,
  EpdfPageTemplate,
  EpdfStage,
  withStage,
  type RevealZoom,
} from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Spots to jump to: a page index and a box in page coordinates (points from
// the page's top-left), like a search hit or a comment would give you.
const SPOTS = [
  { label: 'Top of page 2', page: 1, rect: { x: 72, y: 72, width: 468, height: 96 } },
  { label: 'Middle of page 3', page: 2, rect: { x: 72, y: 340, width: 468, height: 120 } },
  { label: 'Corner of page 4', page: 3, rect: { x: 330, y: 620, width: 210, height: 110 } },
];

const ZOOMS: { label: string; zoom: RevealZoom }[] = [
  { label: 'Keep zoom', zoom: 'keep' },
  { label: 'Fit width', zoom: 'fit-width' },
  { label: 'Fit the box', zoom: 'fit' },
];

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfPageChrome, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './reveal.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <div class="spots">
          @for (spot of spots; track spot.label) {
            <button
              type="button"
              class="button"
              [attr.aria-pressed]="$index === active()"
              [disabled]="spot.page >= stage.pageCount()"
              (click)="reveal(stage, $index, zoom())"
            >
              {{ spot.label }}
            </button>
          }
        </div>
        <div class="segmented" role="group" aria-label="Zoom">
          @for (option of zooms; track option.label) {
            <button
              type="button"
              [attr.aria-pressed]="option.zoom === zoom()"
              (click)="zoom.set(option.zoom)"
            >
              {{ option.label }}
            </button>
          }
        </div>
      </div>

      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
        <ng-template epdfPageChrome let-page>
          @for (spot of spots; track spot.label) {
            @if (spot.page === page.pageIndex()) {
              <!-- Page coordinates become pixels only here, as the spot is drawn. -->
              @let box = page.transform().pageToViewRect(spot.rect);
              <div
                class="spot"
                [attr.data-active]="$index === active()"
                [style.left.px]="box.x"
                [style.top.px]="box.y"
                [style.width.px]="box.width"
                [style.height.px]="box.height"
              ></div>
            }
          }
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly spots = SPOTS;
  protected readonly zooms = ZOOMS;
  protected readonly active = signal(0);
  protected readonly zoom = signal<RevealZoom>('fit-width');
  private readonly stage = viewChild(EpdfStage);

  constructor() {
    // Open on the first spot, once the document is there.
    effect(() => {
      const stage = this.stage();
      if (!stage || stage.pageCount() === 0) return;
      untracked(() =>
        stage.reveal(SPOTS[0].page, {
          rect: SPOTS[0].rect,
          zoom: 'fit-width',
          anchor: { y: 0.35 },
        }),
      );
    });
  }

  protected reveal(stage: EpdfStage, index: number, zoom: RevealZoom) {
    const spot = SPOTS[index];
    // The box lands about a third from the top, like a browser's find bar.
    stage.reveal(spot.page, { rect: spot.rect, zoom, anchor: { y: 0.35 } });
    this.active.set(index);
  }
}
