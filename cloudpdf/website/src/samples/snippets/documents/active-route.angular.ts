import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { EpdfDocuments } from '@embedpdf/angular/runtime';

@Component({ selector: 'app-document-route', template: '' })
export class DocumentRoute {
  private readonly router = inject(Router);

  constructor() {
    inject(EpdfDocuments)
      .activeChanged$.pipe(takeUntilDestroyed())
      .subscribe(({ documentId }) => this.router.navigate(['/documents', documentId], { replaceUrl: true }));
  }
}
