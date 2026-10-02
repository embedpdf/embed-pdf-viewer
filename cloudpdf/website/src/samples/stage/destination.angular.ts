import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageDestination, PageInfo } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Destinations as a link, a bookmark or the document's opening view give them.
const destinationsFor = (pages: readonly PageInfo[]) => {
  const pageAt = (index: number) => (pages[index] ?? pages[pages.length - 1]).ref;
  return [
    {
      label: 'xyz: page 3 at (72, 100), 200%',
      destination: { kind: 'xyz', page: pageAt(2), x: 72, y: 100, zoom: 2 },
    },
    { label: 'fit: all of page 2', destination: { kind: 'fit', page: pageAt(1) } },
    { label: 'fitH: page 1 from y = 300', destination: { kind: 'fitH', page: pageAt(0), y: 300 } },
    {
      label: 'fitR: a box on page 4',
      destination: { kind: 'fitR', page: pageAt(3), x: 72, y: 420, width: 260, height: 160 },
    },
  ] satisfies { label: string; destination: PageDestination }[];
};

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './destination.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        @for (item of destinations(); track item.label) {
          <button type="button" class="button" (click)="stage.goToDestination(item.destination)">
            {{ item.label }}
          </button>
        }
        <output class="badge">
          page <strong>{{ stage.currentPageIndex() + 1 }}</strong> ·
          <strong>{{ percent(stage.zoomLevel()) }}%</strong>
        </output>
      </div>

      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly document = inject(EpdfDocument);
  protected readonly destinations = computed(() => destinationsFor(this.document.pages()));
  private readonly stage = viewChild(EpdfStage);

  constructor() {
    // Open where the first destination points.
    effect(() => {
      const stage = this.stage();
      const pages = this.document.pages();
      if (!stage || pages.length === 0) return;
      untracked(() => stage.goToDestination(destinationsFor(pages)[0].destination));
    });
  }

  protected percent(zoomLevel: number): number {
    return Math.round(zoomLevel * 100);
  }
}
