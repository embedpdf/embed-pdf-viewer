import { Component, inject } from '@angular/core';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-ink-color',
  template: `
    <input
      #picker
      type="color"
      [value]="defaults().color"
      (input)="annotation.tools.updateDefaults('ink', { color: picker.value })"
    />
  `,
})
export class InkColor {
  protected readonly annotation = inject(EpdfAnnotation);
  protected readonly defaults = this.annotation.tools.defaultsOf('ink');
}
