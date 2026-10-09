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
      withStage(),
      withStage({
        id: 'stage-thumbs',
        token: ThumbsToken,
        interaction: false, // a drag doesn't select text or draw
        zoomGestures: false, // a pinch doesn't resize the thumbnails
        zoom: { pageWidth: 120 },
        gap: { px: 12 },
        pageFrame: { bottom: 20 }, // room for the page number
      }),
    ),
  ],
  template: `<!-- … -->`,
})
export class Reader {}
