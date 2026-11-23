import { Component } from '@angular/core';
import {
  EpdfFieldControlTemplate,
  EpdfFormLayer,
  type FormWidgetItem,
} from '@embedpdf/angular/form';

@Component({
  selector: 'app-fields',
  imports: [EpdfFormLayer, EpdfFieldControlTemplate],
  template: `
    <epdf-form-layer>
      <ng-template [epdfFieldControl]="isCheckbox" let-widget>
        <!-- how this box is drawn: see below -->
      </ng-template>
    </epdf-form-layer>
  `,
})
export class Fields {
  protected readonly isCheckbox = (widget: FormWidgetItem) =>
    widget.control === 'toggle' && widget.kind === 'checkbox';
}
