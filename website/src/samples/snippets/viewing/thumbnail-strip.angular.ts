import { Component } from '@angular/core';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageChrome, EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';
import { ThumbsToken } from './thumbnail-strip-token';

@Component({
  selector: 'app-reader',
  imports: [EpdfStage, EpdfPageTemplate, EpdfPageChrome, EpdfRenderLayer],
  template: `
    <!-- The main view. As the reader moves, keep the current page's thumbnail in view -->
    <epdf-stage #main="epdfStage" (pageChange)="thumbs.reveal($event)">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>

    <!-- The thumbnail strip: a second stage, with its own reference -->
    <epdf-stage
      #thumbs="epdfStage"
      [token]="thumbsToken"
      [interaction]="false"
      [zoomGestures]="false"
    >
      <ng-template epdfPage let-page>
        <button
          (click)="main.goToPage(page.ref)"
          [attr.aria-current]="page.pageIndex() === main.currentPageIndex()"
        >
          <epdf-render-layer />
        </button>
      </ng-template>
      <ng-template epdfPageChrome let-page>
        <span class="label">{{ page.pageIndex() + 1 }}</span>
      </ng-template>
    </epdf-stage>
  `,
})
export class Reader {
  protected readonly thumbsToken = ThumbsToken;
}
