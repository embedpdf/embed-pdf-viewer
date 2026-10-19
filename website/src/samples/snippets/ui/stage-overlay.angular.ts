import { Component, input } from '@angular/core';
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import type { SearchHit } from '@embedpdf/angular/search';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';
import { highlight } from './highlight';

@Component({
  selector: 'app-pages',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfAnchored],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>

      <epdf-anchored [anchor]="{ page: hit().page, bounds: hit().bounds }" placement="bottom">
        <button (click)="highlight(hit())">Highlight</button>
      </epdf-anchored>
    </epdf-stage>
  `,
})
export class Pages {
  readonly hit = input.required<SearchHit>();
  protected readonly highlight = highlight;
}
