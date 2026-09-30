import { Component, inject } from '@angular/core';
import { EpdfDocuments } from '@embedpdf/angular/runtime';

@Component({
  selector: 'app-open-button',
  template: `<input #picker type="file" accept="application/pdf" (change)="open(picker.files![0])" />`,
})
export class OpenButton {
  private readonly documents = inject(EpdfDocuments);

  protected async open(file: File) {
    await this.documents.open({ kind: 'bytes', bytes: await file.arrayBuffer() }, { name: file.name });
  }
}
