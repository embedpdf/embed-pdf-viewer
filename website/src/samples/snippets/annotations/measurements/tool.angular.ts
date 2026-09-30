import { Component, inject } from '@angular/core';
import { EpdfInteraction } from '@embedpdf/angular/interaction';

@Component({
  selector: 'app-measure-button',
  template: `<button (click)="interaction.activateTool('distance')">Measure</button>`,
})
export class MeasureButton {
  protected readonly interaction = inject(EpdfInteraction);
}
