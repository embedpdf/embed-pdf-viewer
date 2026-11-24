import { Component, inject } from '@angular/core';
import { EpdfForm } from '@embedpdf/angular/form';
import { EpdfInteraction } from '@embedpdf/angular/interaction';

@Component({
  selector: 'app-sender-toolbar',
  template: `
    @for (group of form.groups(); track group.id) {
      <button
        [attr.aria-pressed]="form.designGroup() === group.id"
        [disabled]="!form.canSetGroup(group.id)"
        (click)="form.setDesignGroup(group.id)"
      >
        <i [style.background]="group.color"></i> {{ group.label ?? group.id }}
      </button>
    }

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
export class SenderToolbar {
  protected readonly form = inject(EpdfForm);
  protected readonly interaction = inject(EpdfInteraction);

  protected readonly tools = [
    { id: 'form-text', label: 'Text' },
    { id: 'form-checkbox', label: 'Checkbox' },
    { id: 'form-signature', label: 'Signature' },
  ];
}
