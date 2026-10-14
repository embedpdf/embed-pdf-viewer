import { Component } from '@angular/core';
import { withActions } from '@embedpdf/angular/actions';
import { withForm } from '@embedpdf/angular/form';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { engine } from './pdf';

@Component({
  selector: 'app-form-viewer',
  providers: [
    provideEmbedPdf({ engine }, /* … */ withForm(), withActions({ javascript: { enabled: true } })),
  ],
  template: `<!-- … -->`,
})
export class FormViewer {}
