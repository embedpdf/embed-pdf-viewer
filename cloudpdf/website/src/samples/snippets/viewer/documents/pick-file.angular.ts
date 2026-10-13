import { Component, computed, input, signal } from '@angular/core';
import { EpdfPdfViewer } from '@cloudpdf/viewer-angular';
import { fetchDocumentToken } from './api'; // your backend: a token for this user and document

@Component({
  selector: 'app-contracts',
  imports: [EpdfPdfViewer],
  template: `
    <select (change)="picked.set($any($event.target).value)">
      @for (contract of contracts(); track contract.id) {
        <option [value]="contract.id">{{ contract.name }}</option>
      }
    </select>
    <epdf-pdf-viewer [src]="src()" style="height: 80vh" />
  `,
})
export class Contracts {
  readonly contracts = input<{ id: string; name: string }[]>([]);
  readonly picked = signal<string | null>(null);
  // A new src opens the picked document; the same one keeps it open.
  readonly src = computed(() => {
    const id = this.picked() ?? this.contracts()[0]?.id;
    return id ? { token: () => fetchDocumentToken(id) } : null;
  });
}
