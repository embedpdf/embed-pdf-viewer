import { NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';
import {
  EpdfFieldControlTemplate,
  EpdfFormLayer,
  type FormWidgetItem,
} from '@embedpdf/angular/form';

@Component({
  selector: 'app-fields',
  imports: [EpdfFormLayer, EpdfFieldControlTemplate, NgTemplateOutlet],
  template: `
    <epdf-form-layer>
      <ng-template
        [epdfFieldControl]="isTextBox"
        let-widget
        let-native="native"
        let-setValue="setValue"
      >
        <!-- The layer's own text box, and a button at its end that empties it. -->
        <ng-container [ngTemplateOutlet]="native" />
        @if (widget.control === 'text' && !widget.disabled && widget.value !== '') {
          <!-- Tab goes to the text box. -->
          <button
            class="clear-button"
            [attr.aria-label]="'Clear ' + widget.label"
            tabindex="-1"
            (click)="setValue({ value: '' })"
          ></button>
        }
      </ng-template>
    </epdf-form-layer>
  `,
})
export class Fields {
  protected readonly isTextBox = (widget: FormWidgetItem) =>
    widget.control === 'text' && !widget.multiline;
}
