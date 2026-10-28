import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfOutline, withOutline } from '@embedpdf/angular/outline';
import type { OutlineItem } from '@embedpdf/angular/outline';
import { localEngine } from '@embedpdf/engine';

// [!doc-source welcome]
const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// Bookmarks the reader adds: each one goes to the place in view when it's added.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: welcome }] },
      withStage(),
      withRender(),
      withOutline(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './bookmarks.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="layout">
        <aside class="bookmarks">
          <header class="bookmarks-header">
            <h3 class="bookmarks-title">Bookmarks</h3>
            <button
              type="button"
              class="button primary"
              [disabled]="!outline.canEdit()"
              (click)="add(stage.currentPageIndex())"
            >
              Add
            </button>
          </header>
          @if (outline.rows().length === 0) {
            <p class="empty">Scroll to a page, then add a bookmark.</p>
          } @else {
            <ul class="list">
              @for (row of outline.rows(); track row.item.ref.objectNumber) {
                <li
                  class="row"
                  [attr.data-current]="isCurrent(row.item) || null"
                  [attr.data-selected]="isSelected(row.item) || null"
                >
                  <button type="button" class="row-title" (click)="follow(row.item)">
                    {{ row.item.title }}
                  </button>
                  <button
                    type="button"
                    class="row-delete"
                    [attr.aria-label]="'Delete ' + row.item.title"
                    [disabled]="!outline.canEdit()"
                    (click)="outline.delete([row.item.ref])"
                  >
                    ×
                  </button>
                </li>
              }
            </ul>
          }
        </aside>

        <epdf-stage #stage="epdfStage" class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
          </ng-template>
        </epdf-stage>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly outline = inject(EpdfOutline);

  protected add(pageIndex: number) {
    void this.outline.create({ title: `Page ${pageIndex + 1}` }, { select: true });
  }

  protected follow(item: OutlineItem) {
    this.outline.select([item.ref]);
    this.outline.activate(item.ref);
  }

  protected isCurrent(item: OutlineItem): boolean {
    return item.ref.objectNumber === this.outline.current()?.objectNumber;
  }

  protected isSelected(item: OutlineItem): boolean {
    return item.ref.objectNumber === this.outline.selected()[0]?.objectNumber;
  }
}
