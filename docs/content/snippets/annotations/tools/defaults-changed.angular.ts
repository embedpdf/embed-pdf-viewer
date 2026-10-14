import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';

import { saveStyle } from './styles';

@Component({
  selector: 'app-save-styles',
  template: '',
})
export class SaveStyles {
  constructor() {
    inject(EpdfAnnotation)
      .tools.defaultsChanged$.pipe(takeUntilDestroyed())
      .subscribe(({ toolId, defaults }) => saveStyle(toolId, defaults));
  }
}
