import { Component, inject } from '@angular/core';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';
import { Control } from './control'; // your own control

@Component({
  selector: 'app-style-panel',
  imports: [Control],
  template: `
    @let panel = annotation.selection.fields();
    @for (field of panel.fields; track field.key) {
      <app-control
        [field]="field"
        [value]="panel.values[field.key]"
        [mixed]="panel.mixed.includes(field.key)"
        (valueChange)="update(field.key, $event)"
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
