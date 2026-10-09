import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EpdfDocuments } from '@embedpdf/angular/runtime';

@Component({
  selector: 'app-page-count',
  template: `<span>{{ pageCount() }} pages</span>`,
})
export class PageCount {
  private readonly documents = inject(EpdfDocuments);

  protected readonly pageCount = toSignal(
    this.documents.pagesChanged$.pipe(map(({ pages }) => pages.length)),
    { initialValue: 0 },
  );
}
