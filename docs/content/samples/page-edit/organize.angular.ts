import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
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

const sameRef = (left: PageRef, right: PageRef) => left.objectNumber === right.objectNumber;

// Every page as a card. Click cards to select them; the toolbar edits every selected page at once.
@Component({
  selector: 'demo-page-organizer',
  imports: [EpdfPageView, EpdfRenderLayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let canEdit = pageEdit.canEdit();
    @let count = selected().length;
    <div class="toolbar">
      <output class="readout">{{ count }} of {{ document.pages().length }} selected</output>
      <span class="spacer"></span>
      <button
        type="button"
        class="button"
        [disabled]="!canEdit || count === 0"
        (click)="pageEdit.rotateBy(selected(), -90)"
      >
        ⟲ Rotate left
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!canEdit || count === 0"
        (click)="pageEdit.rotateBy(selected(), 90)"
      >
        ⟳ Rotate right
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!canEdit || count === 0"
        (click)="pageEdit.reorder(selected(), 'start')"
      >
        Move to front
      </button>
      <!-- A document keeps at least one page. -->
      <button
        type="button"
        class="button danger"
        [disabled]="!canEdit || count === 0 || count === document.pages().length"
        (click)="deleteSelected()"
      >
        Delete
      </button>
    </div>
    <ol class="pages">
      @for (page of document.pages(); track page.ref.objectNumber) {
        <li>
          <button
            type="button"
            class="card"
            [attr.aria-pressed]="isSelected(page.ref)"
            (click)="toggle(page.ref)"
          >
            <epdf-page-view [page]="page.ref" [width]="120" class="thumbnail">
              <epdf-render-layer />
            </epdf-page-view>
            <span class="label">
              Page {{ page.index + 1 }}
              @if (page.rotation !== 0) {
                <span class="turn"> · {{ page.rotation }}°</span>
              }
            </span>
          </button>
        </li>
      }
    </ol>
  `,
})
export class PageOrganizer {
  protected readonly pageEdit = inject(EpdfPageEdit);
  protected readonly document = inject(EpdfDocument);
  // The second and third pages start selected. Refs, not indexes: they still name the
  // same pages after a reorder.
  protected readonly selected = signal<PageRef[]>(
    this.document
      .pages()
      .slice(1, 3)
      .map((page) => page.ref),
  );

  protected isSelected(page: PageRef): boolean {
    return this.selected().some((ref) => sameRef(ref, page));
  }

  protected toggle(page: PageRef) {
    this.selected.update((selected) =>
      this.isSelected(page) ? selected.filter((ref) => !sameRef(ref, page)) : [...selected, page],
    );
  }

  protected async deleteSelected() {
    await this.pageEdit.delete(this.selected());
    this.selected.set([]);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, PageOrganizer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withRender(),
      withPageEdit(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './organize.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-page-organizer *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
