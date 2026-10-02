import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageView } from '@embedpdf/angular/page-view';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-page-picker',
  imports: [EpdfPageView, EpdfRenderLayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker">
      <div class="choices" role="listbox" aria-label="Pages">
        @for (page of document.pages(); track page.ref.objectNumber) {
          <button
            type="button"
            role="option"
            class="choice"
            [attr.aria-selected]="page.ref.objectNumber === shown()?.objectNumber"
            (click)="picked.set(page.ref)"
          >
            <epdf-page-view [page]="page.ref" [width]="84">
              <epdf-render-layer />
            </epdf-page-view>
            <span class="number">{{ page.label ?? page.index + 1 }}</span>
          </button>
        }
      </div>
      <div class="shown">
        @if (shown(); as shown) {
          <epdf-page-view [page]="shown" [width]="300">
            <epdf-render-layer />
          </epdf-page-view>
        }
      </div>
    </div>
  `,
})
export class PagePicker {
  protected readonly document = inject(EpdfDocument);
  protected readonly picked = signal<PageRef | null>(null);
  // A ref follows its page when pages move, so it's what you keep.
  protected readonly shown = computed(() => this.picked() ?? this.document.pages()[0]?.ref ?? null);
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, PagePicker],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './picker.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-page-picker *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
