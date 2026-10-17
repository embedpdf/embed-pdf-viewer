import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';

import { toast } from './toast';

@Component({
  selector: 'app-save-errors',
  template: '',
})
export class SaveErrors {
  constructor() {
    inject(EpdfAnnotation)
      .writeFailed$.pipe(takeUntilDestroyed())
      .subscribe(({ error }) => toast(`Couldn't save: ${error.message}`));
  }
}
