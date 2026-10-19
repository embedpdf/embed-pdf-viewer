import { Component } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withActions, withActionsUi } from '@embedpdf/angular/actions';
import { engine } from './pdf';

@Component({
  selector: 'app-contract-viewer',
  providers: [provideEmbedPdf({ engine }, /* … */ withActions(), withActionsUi())],
  template: `<!-- your viewer -->`,
})
export class ContractViewer {}
