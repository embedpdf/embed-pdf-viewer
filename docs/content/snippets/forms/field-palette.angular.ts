import { Component, inject } from '@angular/core';
import { EpdfInteraction } from '@embedpdf/angular/interaction';

@Component({
  selector: 'app-field-palette',
  template: `
    @for (tool of tools; track tool.id) {
      <button
        [attr.aria-pressed]="interaction.activeToolId() === tool.id"
        (click)="interaction.activateTool(tool.id)"
      >
        {{ tool.label }}
      </button>
    }
  `,
})
export class FieldPalette {
  protected readonly interaction = inject(EpdfInteraction);

  protected readonly tools = [
    { id: 'form-text', label: 'Text' },
    { id: 'form-checkbox', label: 'Checkbox' },
    { id: 'form-radio', label: 'Radio button' },
    { id: 'form-combobox', label: 'Dropdown' },
    { id: 'form-listbox', label: 'List' },
    { id: 'form-signature', label: 'Signature' },
  ];
}
