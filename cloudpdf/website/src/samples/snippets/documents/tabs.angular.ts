import { Component, inject } from '@angular/core';
import { EpdfDocuments } from '@embedpdf/angular/runtime';

@Component({
  selector: 'app-tabs',
  template: `
    <div role="tablist">
      @for (document of documents.documents(); track document.id) {
        <div>
          <button
            role="tab"
            [attr.aria-selected]="document.id === documents.activeId()"
            (click)="documents.setActive(document.id)"
          >
            {{ document.name }}
          </button>
          <button [attr.aria-label]="'Close ' + document.name" (click)="documents.close(document.id)">
            ×
          </button>
        </div>
      }
    </div>
  `,
})
export class Tabs {
  protected readonly documents = inject(EpdfDocuments);
}
