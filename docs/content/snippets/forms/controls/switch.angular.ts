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
      <ng-template [epdfFieldControl]="isCheckbox" let-widget let-setValue="setValue">
        <!-- It fills its frame (width and height 100% in your CSS), and turns with the field. -->
        @if (widget.control === 'toggle') {
          <button
            role="switch"
            class="switch"
            [attr.aria-checked]="widget.checked"
            [attr.aria-label]="widget.label"
            [disabled]="widget.disabled"
            (click)="setValue({ checked: !widget.checked })"
          ></button>
        }
      </ng-template>
    </epdf-form-layer>
  `,
})
export class Fields {
  protected readonly isCheckbox = (widget: FormWidgetItem) =>
    widget.control === 'toggle' && widget.kind === 'checkbox';
}
