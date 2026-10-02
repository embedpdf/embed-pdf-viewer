import { Component } from '@angular/core';
import { withFilePicker } from '@embedpdf/angular/annotation';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';

import { Pages } from './pages';
import { engine, features } from './setup';
import { openStampLibrary } from './stamp-library';

@Component({
  selector: 'app-review',
  imports: [Pages],
  providers: [
    provideEmbedPdf(
      { engine },
      ...features,
      withFilePicker(async ({ toolId, page, point }) => {
        if (toolId === 'stamp') return { data: await openStampLibrary() };
        return null;
      }),
    ),
  ],
  template: `<app-pages />`,
})
export class Review {}
