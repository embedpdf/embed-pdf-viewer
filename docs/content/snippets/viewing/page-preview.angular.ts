import { Component, input } from '@angular/core';
import { EpdfPageView } from '@embedpdf/angular/page-view';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import type { PageRef } from '@embedpdf/angular/runtime';

@Component({
  selector: 'app-page-preview',
  imports: [EpdfPageView, EpdfRenderLayer],
  template: `
    <epdf-page-view [page]="page()" [width]="240">
      <epdf-render-layer />
    </epdf-page-view>
  `,
})
export class PagePreview {
  readonly page = input.required<PageRef>();
}
