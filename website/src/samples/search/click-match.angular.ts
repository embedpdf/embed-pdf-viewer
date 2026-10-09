import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSearch, EpdfSearchLayer, withSearch } from '@embedpdf/angular/search';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Which match is the active one: the first on load, then the one you click.
@Component({
  selector: 'demo-active-match',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <output class="readout">
        @if (search.hitCount() > 0) {
          Match {{ search.activeHitIndex() + 1 }} of {{ search.hitCount() }}
        } @else {
          Searching…
        }
      </output>
      <span class="hint">Click a highlighted match to make it the active one.</span>
    </div>
  `,
})
export class ActiveMatch {
  protected readonly search = inject(EpdfSearch);

  constructor() {
    // It's drawn once the document is open: search right away.
    void this.search.search({ text: 'PDF' });
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSearchLayer,
    ActiveMatch,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withSearch(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './click-match.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-active-match />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-search-layer (hitClick)="search.goToHit($event)" />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly search = inject(EpdfSearch);
}
