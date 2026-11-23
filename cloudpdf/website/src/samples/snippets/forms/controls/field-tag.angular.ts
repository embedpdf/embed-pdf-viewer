import { Component, inject, input } from '@angular/core';
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { EpdfForm, type FormField } from '@embedpdf/angular/form';

// A tag beside the first box of a field.
@Component({
  selector: 'app-field-tag',
  imports: [EpdfAnchored],
  template: `
    <epdf-anchored [anchor]="anchor()" placement="left" [gap]="4" pinned>
      <span class="tag"><ng-content /></span>
    </epdf-anchored>
  `,
})
export class FieldTag {
  readonly field = input.required<FormField>();

  private readonly form = inject(EpdfForm);
  protected readonly anchor = this.form.widgetAnchorOf(
    () => this.form.getWidgets(this.field().ref)[0]?.ref ?? null,
  );
}
