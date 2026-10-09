import type { ApplicationConfig } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withRender } from '@embedpdf/angular/render';
import { withSearch } from '@embedpdf/angular/search';
import { withStage } from '@embedpdf/angular/stage';
import { engine } from './pdf';

export const appConfig: ApplicationConfig = {
  providers: [
    provideEmbedPdf({ engine }, withStage({ layout: 'horizontal' }), withRender(), withSearch()),
  ],
};
