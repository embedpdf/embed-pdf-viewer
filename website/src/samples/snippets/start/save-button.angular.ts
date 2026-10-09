import { Component, inject } from '@angular/core';
import { EpdfDocuments, saveFile } from '@embedpdf/angular/runtime';

@Component({
  selector: 'app-save-button',
  template: `<button (click)="save()">Save</button>`,
})
export class SaveButton {
  private readonly documents = inject(EpdfDocuments);

  protected async save() {
    saveFile(await this.documents.download(), 'reviewed.pdf');
  }
}
