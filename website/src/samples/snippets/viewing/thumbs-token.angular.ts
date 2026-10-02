import { Component } from '@angular/core';
import { createCapabilityToken, provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withStage, type StageCapability } from '@embedpdf/angular/stage';
import { engine } from './pdf';

export const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');

@Component({
  selector: 'app-reader',
  providers: [
    provideEmbedPdf(
      { engine },
      withStage(), // the main view
      withStage({ id: 'stage-thumbs', token: ThumbsToken, layout: 'grid', zoom: { pageWidth: 120 } }),
    ),
  ],
  template: `<!-- … -->`,
})
export class Reader {}
