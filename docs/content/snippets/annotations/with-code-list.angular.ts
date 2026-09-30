import { Component, inject } from '@angular/core';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-highlight-count',
  template: `<p>{{ highlights().length }} highlights</p>`,
})
export class HighlightCount {
  protected readonly highlights = inject(EpdfAnnotation).watch({ subtype: 'highlight' });
}
