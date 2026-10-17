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
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A button below the active match: it follows the match while you scroll and zoom.
@Component({
  selector: 'demo-next-match',
  imports: [EpdfAnchored],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <epdf-anchored [anchor]="anchor()" placement="bottom">
      <button type="button" class="pill" (click)="search.nextHit()">
        {{ search.activeHitIndex() + 1 }} of {{ search.hitCount() }} · Next →
      </button>
    </epdf-anchored>
  `,
})
export class NextMatch {
  protected readonly search = inject(EpdfSearch);
  protected readonly anchor = computed(() => {
    const hit = this.search.activeHit();
    return hit && { page: hit.page, bounds: hit.bounds };
  });
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSearchLayer,
    NextMatch,
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
  styleUrl: './overlay.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <epdf-stage *epdfDocumentGate="let document; fallback: loading" class="stage">
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-search-layer />
      </ng-template>
      <demo-next-match />
    </epdf-stage>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly search = inject(EpdfSearch);
  private readonly document = inject(EpdfDocument);

  constructor() {
    // Every "PDF" in the document, and the view on the first one.
    effect(() => {
      if (this.document.status() !== 'ready') return;
      void this.search.search({ text: 'PDF' }).then(() => this.search.revealActiveHit());
    });
  }
}
