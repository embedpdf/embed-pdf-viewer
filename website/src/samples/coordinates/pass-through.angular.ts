import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSearch, EpdfSearchLayer, withSearch } from '@embedpdf/angular/search';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSearchLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withSearch(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pass-through.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div *epdfDocumentGate="let document; fallback: loading" class="layout">
      <!-- A search hit says where it is in page coordinates; the Stage takes them as they are. -->
      <ol class="hits">
        @for (hit of firstHits(); track hit.page.objectNumber + ':' + hit.start) {
          @if (hit.bounds; as bounds) {
            <li>
              <button
                type="button"
                class="hit"
                (click)="stage.reveal(hit.page, { rect: bounds, anchor: { y: 0.35 } })"
              >
                <span class="where">page {{ hit.pageIndex + 1 }}</span>
                <code class="rect">x {{ round(bounds.x) }}, y {{ round(bounds.y) }}</code>
              </button>
            </li>
          }
        }
      </ol>
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-search-layer />
        </ng-template>
      </epdf-stage>
    </div>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly search = inject(EpdfSearch);
  private readonly document = inject(EpdfDocument);
  protected readonly firstHits = computed(() => this.search.hits().slice(0, 8));
  protected readonly round = Math.round;

  constructor() {
    effect(() => {
      if (this.document.status() === 'ready') void this.search.search({ text: 'PDF' });
    });
  }
}
