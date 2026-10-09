import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocument,
  EpdfDocumentGate,
  provideEmbedPdf,
  saveFile,
} from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageView } from '@embedpdf/angular/page-view';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfPageEdit, withPageEdit } from '@embedpdf/angular/page-edit';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// Tick pages, then download them as a PDF of their own. This document doesn't change.
@Component({
  selector: 'demo-extract-pages',
  imports: [EpdfPageView, EpdfRenderLayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button
        type="button"
        class="button primary"
        [disabled]="chosen().length === 0 || !pageEdit.canExtract()"
        (click)="download()"
      >
        Download {{ chosen().length === 1 ? '1 page' : chosen().length + ' pages' }} as a PDF
      </button>
      <output class="readout">{{ saved() }}</output>
    </div>
    <ol class="grid">
      @for (page of document.pages(); track page.ref.objectNumber) {
        <li>
          <label class="card" [attr.data-ticked]="isTicked(page.ref)">
            <epdf-page-view [page]="page.ref" [width]="110" class="thumbnail">
              <epdf-render-layer />
            </epdf-page-view>
            <span class="label">
              <input type="checkbox" [checked]="isTicked(page.ref)" (change)="toggle(page.ref)" />
              Page {{ page.index + 1 }}
            </span>
          </label>
        </li>
      }
    </ol>
  `,
})
export class ExtractPages {
  protected readonly pageEdit = inject(EpdfPageEdit);
  protected readonly document = inject(EpdfDocument);
  // The middle two pages start ticked.
  private readonly ticked = signal<PageRef[]>(
    this.document
      .pages()
      .slice(1, 3)
      .map((page) => page.ref),
  );
  protected readonly saved = signal<string | null>(null);

  // In document order, whatever order they were ticked in.
  protected readonly chosen = computed(() =>
    this.document
      .pages()
      .filter((page) => this.isTicked(page.ref))
      .map((page) => page.ref),
  );

  protected isTicked(ref: PageRef): boolean {
    return this.ticked().some((each) => each.objectNumber === ref.objectNumber);
  }

  protected toggle(ref: PageRef) {
    this.ticked.update((ticked) =>
      this.isTicked(ref)
        ? ticked.filter((each) => each.objectNumber !== ref.objectNumber)
        : [...ticked, ref],
    );
  }

  protected async download() {
    const chosen = this.chosen();
    const bytes = await this.pageEdit.extract(chosen);
    saveFile(bytes, 'pages.pdf');
    this.saved.set(
      `pages.pdf · ${chosen.length} pages · ${Math.round(bytes.byteLength / 1024)} KB`,
    );
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, ExtractPages],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withRender(),
      withPageEdit(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './extract.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-extract-pages *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
