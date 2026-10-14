import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageInfo, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageView } from '@embedpdf/angular/page-view';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfPageEdit, withPageEdit, type PagePlacement } from '@embedpdf/angular/page-edit';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Pick a page, then move it. Each button uses another placement.
@Component({
  selector: 'demo-page-order',
  imports: [EpdfPageView, EpdfRenderLayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let canEdit = pageEdit.canEdit();
    <div class="toolbar">
      <output class="readout">
        @if (page(); as page) {
          Page {{ page.index + 1 }} selected
        } @else {
          Pick a page
        }
      </output>
      <span class="spacer"></span>
      <button
        type="button"
        class="button"
        [disabled]="!canEdit || !before()"
        (click)="moveTo('start')"
      >
        ⇤ To the front
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!canEdit || !before()"
        (click)="moveBefore(before())"
      >
        ← Earlier
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!canEdit || !after()"
        (click)="moveAfter(after())"
      >
        Later →
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!canEdit || !after()"
        (click)="moveTo('end')"
      >
        To the back ⇥
      </button>
    </div>
    <ol class="strip">
      @for (each of document.pages(); track each.ref.objectNumber) {
        <li>
          <button
            type="button"
            class="card"
            [attr.aria-pressed]="each.ref.objectNumber === selected()?.objectNumber"
            (click)="selected.set(each.ref)"
          >
            <epdf-page-view [page]="each.ref" [width]="110" class="thumbnail">
              <epdf-render-layer />
            </epdf-page-view>
            <span class="label">{{ each.index + 1 }}</span>
          </button>
        </li>
      }
    </ol>
  `,
})
export class PageOrder {
  protected readonly pageEdit = inject(EpdfPageEdit);
  protected readonly document = inject(EpdfDocument);
  // The last page starts selected. Its ref names it wherever it moves.
  protected readonly selected = signal<PageRef | null>(this.document.pages().at(-1)?.ref ?? null);

  protected readonly page = computed(
    () =>
      this.document
        .pages()
        .find((each) => each.ref.objectNumber === this.selected()?.objectNumber) ?? null,
  );
  protected readonly before = computed(() => {
    const page = this.page();
    return (page && this.document.pages()[page.index - 1]) ?? null;
  });
  protected readonly after = computed(() => {
    const page = this.page();
    return (page && this.document.pages()[page.index + 1]) ?? null;
  });

  protected moveTo(placement: PagePlacement) {
    const page = this.page();
    if (page) void this.pageEdit.reorder([page.ref], placement);
  }

  protected moveBefore(other: PageInfo | null) {
    if (other) this.moveTo({ before: other.ref });
  }

  protected moveAfter(other: PageInfo | null) {
    if (other) this.moveTo({ after: other.ref });
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, PageOrder],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withRender(),
      withPageEdit(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './reorder.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-page-order *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
