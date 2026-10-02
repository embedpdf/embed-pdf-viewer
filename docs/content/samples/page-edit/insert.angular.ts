import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfPageEdit, withPageEdit } from '@embedpdf/angular/page-edit';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/** Another PDF's bytes, to insert pages from. */
const otherPdf = async () => (await fetch('https://snippet.embedpdf.com/ebook.pdf')).arrayBuffer();

// Inserts next to the page you're on, then goes to the first new page.
@Component({
  selector: 'demo-insert-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (page(); as page) {
      <div class="toolbar">
        <button
          type="button"
          class="button"
          [disabled]="!pageEdit.canEdit()"
          (click)="insertBlankAfter(page.ref)"
        >
          + Blank page after
        </button>
        <button
          type="button"
          class="button"
          [disabled]="!pageEdit.canEdit() || !pageEdit.canExtract()"
          (click)="duplicate(page.ref)"
        >
          Duplicate page
        </button>
        <button
          type="button"
          class="button"
          [disabled]="!pageEdit.canEdit()"
          (click)="insertFromOtherPdf(page.ref)"
        >
          + Pages 1 and 3 of another PDF
        </button>
        <span class="spacer"></span>
        <output class="readout">{{ readout() }}</output>
      </div>
    }
  `,
})
export class InsertToolbar {
  readonly stage = input.required<EpdfStage>();
  protected readonly pageEdit = inject(EpdfPageEdit);
  private readonly document = inject(EpdfDocument);
  protected readonly page = computed(
    () => this.document.pages()[this.stage().currentPageIndex()] ?? null,
  );
  private readonly added = signal<readonly PageRef[]>([]);
  protected readonly readout = computed(() => {
    const pages = this.document.pages();
    const positions = this.added()
      .map((ref) => pages.findIndex((each) => each.ref.objectNumber === ref.objectNumber) + 1)
      .filter((position) => position > 0);
    return positions.length > 0
      ? `New: page ${positions.join(' and ')} of ${pages.length}`
      : `${pages.length} pages`;
  });

  constructor() {
    // A blank page after the cover, once, on load.
    const insertOnLoad = effect(() => {
      const cover = this.document.pages()[0];
      if (!cover) return;
      insertOnLoad.destroy();
      untracked(() => this.insertBlankAfter(cover.ref));
    });
  }

  protected async insertBlankAfter(page: PageRef) {
    this.show(await this.pageEdit.insertBlank({ placement: { after: page } }));
  }

  protected async duplicate(page: PageRef) {
    this.show(await this.pageEdit.duplicate([page]));
  }

  protected async insertFromOtherPdf(page: PageRef) {
    this.show(
      await this.pageEdit.insertFromBytes(await otherPdf(), {
        pageIndexes: [0, 2],
        placement: { after: page },
      }),
    );
  }

  // Every insert resolves { pages }: the new pages, to go to or select.
  private show(result: { pages: readonly PageRef[] }) {
    this.added.set(result.pages);
    this.stage().goToPage(result.pages[0]);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, InsertToolbar],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withPageEdit(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './insert.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-insert-toolbar [stage]="stage" />
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
