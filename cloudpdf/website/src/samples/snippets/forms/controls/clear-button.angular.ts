import { NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  EpdfFieldControlTemplate,
  EpdfForm,
  EpdfFormLayer,
  type EpdfFieldControlTemplateContext,
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
            (click)="clear(widget, setValue)"
          ></button>
        }
      </ng-template>
    </epdf-form-layer>
  `,
})
export class Fields {
  private readonly form = inject(EpdfForm);

  protected readonly isTextBox = (widget: FormWidgetItem) =>
    widget.control === 'text' && !widget.multiline;

  // Empty the box, then put the cursor back in it, ready for the new value.
  protected clear(widget: FormWidgetItem, setValue: EpdfFieldControlTemplateContext['setValue']) {
    void setValue({ value: '' }).then(() => this.form.focus(widget.fieldRef));
  }
}
