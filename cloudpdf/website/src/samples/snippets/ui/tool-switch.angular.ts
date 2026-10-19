import { Component, inject } from '@angular/core';
import { EpdfInteraction } from '@embedpdf/angular/interaction';

@Component({
  selector: 'app-tool-switch',
  template: `
    <button
      [attr.aria-pressed]="interaction.activeToolId() === 'pointer'"
      (click)="interaction.activateTool('pointer')"
    >
      Select
    </button>
    <button
      [attr.aria-pressed]="interaction.activeToolId() === 'pan'"
      (click)="interaction.activateTool('pan')"
    >
      Hand
    </button>
  `,
})
export class ToolSwitch {
  protected readonly interaction = inject(EpdfInteraction);
}
