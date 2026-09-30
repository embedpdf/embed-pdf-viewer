import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfShell } from '@embedpdf/angular/shell';
import { analytics } from './analytics';

@Component({
  selector: 'app-viewer-layout',
  template: `<!-- your toolbar, panels and pages -->`,
})
export class ViewerLayout {
  private readonly shell = inject(EpdfShell);

  constructor() {
    this.shell.surfaceOpened$
      .pipe(takeUntilDestroyed())
      .subscribe(({ id }) => analytics.track('panel', { id }));
  }
}
