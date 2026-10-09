import { Component, DOCUMENT, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfI18n } from '@embedpdf/angular/i18n';

@Component({
  selector: 'app-viewer-layout',
  template: `<!-- your toolbar and pages -->`,
})
export class ViewerLayout {
  private readonly i18n = inject(EpdfI18n);
  private readonly document = inject(DOCUMENT);

  constructor() {
    this.i18n.localeChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(({ locale }) => this.document.documentElement.setAttribute('lang', locale));
  }
}
