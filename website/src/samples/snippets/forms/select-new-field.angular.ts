import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfForm } from '@embedpdf/angular/form';
import { selectField } from './editor';

@Component({ selector: 'app-select-new-fields', template: '' })
export class SelectNewFields {
  constructor() {
    inject(EpdfForm)
      .fieldCreated$.pipe(takeUntilDestroyed())
      .subscribe(({ field }) => selectField(field));
  }
}
