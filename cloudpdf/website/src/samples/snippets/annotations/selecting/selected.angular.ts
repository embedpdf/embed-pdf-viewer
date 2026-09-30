import { Component, inject } from '@angular/core';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-selection-count',
  template: `<p>{{ annotation.selected().length }} selected</p>`,
})
export class SelectionCount {
  protected readonly annotation = inject(EpdfAnnotation);
}
