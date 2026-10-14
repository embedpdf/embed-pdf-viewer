import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-remember-defaults',
  template: '',
})
export class RememberDefaults {
  constructor() {
    inject(EpdfAnnotation)
      .tools.defaultsChanged$.pipe(takeUntilDestroyed())
      .subscribe(({ toolId, defaults }) => {
        localStorage.setItem(`tool:${toolId}`, JSON.stringify(defaults));
      });
  }
}
