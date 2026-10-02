import { afterNextRender, Component, inject } from '@angular/core';
import { EpdfDocuments } from '@embedpdf/angular/runtime';

@Component({
  selector: 'app-contract',
  template: `<!-- your toolbar and pages -->`,
})
export class Contract {
  private readonly documents = inject(EpdfDocuments);

  constructor() {
    // Runs in the browser only, after the first render
    afterNextRender(() => {
      void this.documents.open({ kind: 'url', url: '/files/contract.pdf' });
    });
  }
}
