import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfSelection } from '@embedpdf/angular/selection';

import { prefetchTranslation } from './translation';

@Component({
  selector: 'app-translation-prefetch',
  template: '',
})
export class TranslationPrefetch {
  constructor() {
    inject(EpdfSelection)
      .committed$.pipe(takeUntilDestroyed())
      .subscribe(() => prefetchTranslation());
  }
}
