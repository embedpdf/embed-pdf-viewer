import { Component } from '@angular/core';
import { withFilePicker } from '@embedpdf/angular/annotation';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';

import { Pages } from './pages';
import { engine, features } from './setup';

@Component({
  selector: 'app-review',
  imports: [Pages],
  providers: [provideEmbedPdf({ engine }, ...features, withFilePicker())],
  template: `<app-pages />`,
})
export class Review {}
