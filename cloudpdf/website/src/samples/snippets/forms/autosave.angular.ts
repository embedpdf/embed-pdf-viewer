import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfForm } from '@embedpdf/angular/form';
import { autosave } from './api';

@Component({ selector: 'app-autosave', template: '' })
export class Autosave {
  constructor() {
    inject(EpdfForm)
      .valueChanged$.pipe(takeUntilDestroyed())
      .subscribe(({ field }) => autosave(field.name));
  }
}
