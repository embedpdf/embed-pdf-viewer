import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfSearch, EpdfSearchLayer, withSearch } from '@embedpdf/angular/search';
import {
  EpdfSelection,
  EpdfSelectionLayer,
  EpdfSelectionMenu,
  withSelection,
} from '@embedpdf/angular/selection';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSearchLayer,
    EpdfSelectionLayer,
    EpdfSelectionMenu,
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
  styleUrl: './layers.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <label class="option">
          <input
            #search
            type="checkbox"
            [checked]="showSearch()"
            (change)="showSearch.set(search.checked)"
          />
          Search matches
        </label>
        <label class="option">
          <input
            #selection
            type="checkbox"
            [checked]="showSelection()"
            (change)="showSelection.set(selection.checked)"
          />
          Text selection
        </label>
      </div>
      <!-- Layers draw inside each page, later ones on top; the menu floats above them. -->
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          @if (showSearch()) {
            <epdf-search-layer />
          }
          @if (showSelection()) {
            <epdf-selection-layer />
          }
        </ng-template>
        @if (showSelection()) {
          <epdf-selection-menu>
            <div class="menu">
              <button type="button" (click)="clearSelection()">Clear the selection</button>
            </div>
          </epdf-selection-menu>
        }
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Opening…</p></ng-template>
  `,
})
export class App {
  protected readonly showSearch = signal(true);
  protected readonly showSelection = signal(true);
  private readonly search = inject(EpdfSearch);
  private readonly selection = inject(EpdfSelection);
  private readonly document = inject(EpdfDocument);

  constructor() {
    // Something on every layer on load: the matches of a search, and the title selected.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (!cover) return;
      void this.search.search({ text: 'PDF' });
      this.selection.select({ page: cover, start: 10, count: 52 });
    });
  }

  protected clearSelection() {
    this.selection.clear();
  }
}
