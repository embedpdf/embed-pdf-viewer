import { Component, inject } from '@angular/core';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';
import { Control } from './control'; // your own control

@Component({
  selector: 'app-style-panel',
  imports: [Control],
  template: `
    @let panel = annotation.selection.properties();
    @for (property of panel.properties; track property.key) {
      <app-control
        [property]="property"
        [value]="panel.values[property.key]"
        [mixed]="panel.mixed.includes(property.key)"
        (valueChange)="update(property.key, $event)"
      />
    }
  `,
})
export class StylePanel {
  protected readonly annotation = inject(EpdfAnnotation);

  protected update(key: string, value: unknown) {
    this.annotation.selection.update({ [key]: value });
  }
}
