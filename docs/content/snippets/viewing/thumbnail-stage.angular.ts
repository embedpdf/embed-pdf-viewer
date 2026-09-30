import { Component } from '@angular/core';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';
import { ThumbsToken } from './thumbs-token';

@Component({
  selector: 'app-thumbnails',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  template: `
    <epdf-stage [token]="thumbsToken" [interaction]="false">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class Thumbnails {
  protected readonly thumbsToken = ThumbsToken;
}
