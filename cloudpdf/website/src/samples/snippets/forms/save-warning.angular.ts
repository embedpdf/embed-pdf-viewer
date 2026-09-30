import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfSignature } from '@embedpdf/angular/signature';
import { showWarning } from './warnings';

@Component({ selector: 'app-save-warning', template: '' })
export class SaveWarning {
  constructor() {
    inject(EpdfSignature)
      .invalidationPredicted$.pipe(takeUntilDestroyed())
      .subscribe(() => showWarning('Saving this change will break a signature.'));
  }
}
