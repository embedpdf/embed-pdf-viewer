import { Component, inject } from '@angular/core';
import { EpdfForm } from '@embedpdf/angular/form';

@Component({
  selector: 'app-field-settings',
  template: `
    @if (form.selectedField(); as field) {
      <input #nameInput [value]="field.name" (blur)="form.update(field.ref, { name: nameInput.value })" />
      <label>
        <input
          #requiredInput
          type="checkbox"
          [checked]="field.required"
          (change)="form.update(field.ref, { required: requiredInput.checked })"
        />
        Required
      </label>
    }
  `,
})
export class FieldSettings {
  protected readonly form = inject(EpdfForm);
}
