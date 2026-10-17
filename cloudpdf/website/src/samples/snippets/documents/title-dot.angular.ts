import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { EpdfDocuments } from '@embedpdf/angular/runtime';

@Component({ selector: 'app-title-dot', template: '' })
export class TitleDot {
  private readonly title = inject(Title);

  constructor() {
    inject(EpdfDocuments)
      .unsavedChangesChanged$.pipe(takeUntilDestroyed())
      .subscribe(({ hasUnsavedChanges }) => this.title.setTitle(hasUnsavedChanges ? '● Contract' : 'Contract'));
  }
}
