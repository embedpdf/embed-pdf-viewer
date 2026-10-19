import { Component } from '@angular/core';
import { DocumentViewer } from './document-viewer';

@Component({
  selector: 'app-contract-page',
  imports: [DocumentViewer],
  template: `
    @defer (on viewport) {
      <app-document-viewer />
    } @placeholder {
      <div style="height: 600px">Loading the viewer…</div>
    }
  `,
})
export class ContractPage {}
