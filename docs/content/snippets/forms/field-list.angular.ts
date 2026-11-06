import { Component, inject } from '@angular/core';
import { EpdfForm } from '@embedpdf/angular/form';

@Component({
  selector: 'app-field-list',
  template: `
    <ul>
      @for (field of form.fields(); track field.name) {
        <li>{{ field.name }}: {{ field.kind }}</li>
      }
    </ul>
  `,
})
export class FieldList {
  protected readonly form = inject(EpdfForm);
}
