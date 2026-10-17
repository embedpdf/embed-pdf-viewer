import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfActions } from '@embedpdf/angular/actions';

@Component({ selector: 'app-action-diagnostics', template: '' })
export class ActionDiagnostics {
  constructor() {
    inject(EpdfActions)
      .diagnosticReported$.pipe(takeUntilDestroyed())
      .subscribe(({ code, action }) => console.warn(`Action ${action} was not run: ${code}`));
  }
}
