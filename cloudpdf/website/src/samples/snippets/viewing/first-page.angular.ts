import { Component } from '@angular/core';
import { EpdfPageView } from '@embedpdf/angular/page-view';
import { EpdfRenderLayer } from '@embedpdf/angular/render';

@Component({
  selector: 'app-first-page',
  imports: [EpdfPageView, EpdfRenderLayer],
  template: `
    <epdf-page-view [page]="0" [width]="320">
      <epdf-render-layer />
    </epdf-page-view>
  `,
})
export class FirstPage {}
