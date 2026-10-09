import { Component, inject } from '@angular/core';
import { EpdfInteraction } from '@embedpdf/angular/interaction';

@Component({
  selector: 'app-toolbar',
  template: `
    @for (id of tools; track id) {
      <button
        [attr.aria-pressed]="interaction.activeToolId() === id"
        (click)="interaction.activateTool(id)"
      >
        {{ id }}
      </button>
    }
  `,
})
export class Toolbar {
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly tools = ['pointer', 'square', 'ink', 'highlight', 'note'];
}
