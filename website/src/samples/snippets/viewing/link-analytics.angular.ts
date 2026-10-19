import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfLink, EpdfLinkLayer } from '@embedpdf/angular/link';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';
import { analytics } from './analytics';

@Component({
  selector: 'app-reader',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfLinkLayer],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-link-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class Reader {
  constructor() {
    inject(EpdfLink)
      .activated$.pipe(takeUntilDestroyed())
      .subscribe(({ target }) => analytics.track('link_followed', { kind: target.kind }));
  }
}
