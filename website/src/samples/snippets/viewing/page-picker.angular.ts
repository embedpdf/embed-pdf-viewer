import { Component, inject, output } from '@angular/core';
import { EpdfPageView } from '@embedpdf/angular/page-view';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfDocument, type PageRef } from '@embedpdf/angular/runtime';

@Component({
  selector: 'app-page-picker',
  imports: [EpdfPageView, EpdfRenderLayer],
  template: `
    @for (page of document.pages(); track page.index) {
      <button (click)="pick.emit(page.ref)">
        <epdf-page-view [page]="page.ref" [width]="120">
          <epdf-render-layer />
        </epdf-page-view>
        {{ page.label ?? page.index + 1 }}
      </button>
    }
  `,
})
export class PagePicker {
  protected readonly document = inject(EpdfDocument);
  readonly pick = output<PageRef>();
}
