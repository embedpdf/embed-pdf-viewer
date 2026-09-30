import { Component, inject } from '@angular/core';
import { EpdfInteraction } from '@embedpdf/angular/interaction';
import { EpdfRedaction } from '@embedpdf/angular/redaction';

@Component({
  selector: 'app-redact-bar',
  template: `
    <button (click)="interaction.activateTool('redact')">Mark for redaction</button>
    <button
      [disabled]="!redaction.pendingCount() || redaction.applying()"
      (click)="redaction.applyAll()"
    >
      Redact {{ redaction.pendingCount() }} marks
    </button>
  `,
})
export class RedactBar {
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly redaction = inject(EpdfRedaction);
}
