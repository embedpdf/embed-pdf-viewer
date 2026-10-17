import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfSelection, EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { EpdfSearch, EpdfSearchLayer, withSearch } from '@embedpdf/angular/search';
import { localEngine } from '@embedpdf/engine';

const TITLE = { start: 10, count: 52 };

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// On load: the cover's title is selected and "PDF" is found, so every color below has something to paint.
@Component({
  selector: 'demo-show-colors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class ShowColors {
  constructor() {
    const selection = inject(EpdfSelection);
    const document = inject(EpdfDocument);
    void inject(EpdfSearch).search({ text: 'PDF' });
    effect(() => {
      const cover = document.pages()[0]?.ref;
      if (cover) untracked(() => selection.select({ page: cover, ...TITLE }));
    });
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
    EpdfSelectionLayer,
    ShowColors,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
      withSearch(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dark-mode.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <!-- Your app's own switch: the colors are in the stylesheet, under [data-theme='dark']. -->
    <div class="pdf-viewer" [attr.data-theme]="theme()">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Theme">
          <button type="button" [attr.aria-pressed]="theme() === 'light'" (click)="theme.set('light')">
            Light
          </button>
          <button type="button" [attr.aria-pressed]="theme() === 'dark'" (click)="theme.set('dark')">
            Dark
          </button>
        </div>
      </div>
      <ng-container *epdfDocumentGate="let document; fallback: loading">
        <demo-show-colors />
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-search-layer />
            <epdf-selection-layer />
          </ng-template>
        </epdf-stage>
      </ng-container>
    </div>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly theme = signal<'light' | 'dark'>('dark');
}
