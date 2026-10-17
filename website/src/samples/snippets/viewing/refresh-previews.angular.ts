import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfRender, EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';
import { refreshMyPreviews } from './previews';

@Component({
  selector: 'app-reader',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class Reader {
  constructor() {
    inject(EpdfRender)
      .invalidated$.pipe(takeUntilDestroyed())
      .subscribe(({ pages }) => refreshMyPreviews(pages));
  }
}
