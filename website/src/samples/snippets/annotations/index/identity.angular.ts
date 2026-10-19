import { Component } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';

import { Pages } from './pages';
import { contract, engine, features } from './setup';

@Component({
  selector: 'app-review',
  imports: [Pages],
  providers: [
    provideEmbedPdf(
      {
        engine,
        identity: { userId: 'u_381', displayName: 'Dana Smith' },
        initialDocuments: [{ source: contract }],
      },
      ...features,
    ),
  ],
  template: `<app-pages />`,
})
export class Review {}
