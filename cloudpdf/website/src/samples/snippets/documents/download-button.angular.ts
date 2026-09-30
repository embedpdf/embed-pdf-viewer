import { Component, inject } from '@angular/core';
import { EpdfDocuments, saveFile } from '@embedpdf/angular/runtime';

@Component({
  selector: 'app-download-button',
  template: `<button (click)="download()">Download</button>`,
})
export class DownloadButton {
  private readonly documents = inject(EpdfDocuments);

  protected async download() {
    saveFile(await this.documents.download(), 'contract.pdf');
  }
}
