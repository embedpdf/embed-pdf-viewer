import { Directive, inject } from '@angular/core';
import { EpdfInteraction } from '@embedpdf/angular/interaction';

/** On your viewer's root element: `<div appHoldSpaceToPan>`. */
@Directive({
  selector: '[appHoldSpaceToPan]',
  host: {
    '(window:keydown.space)': 'press($event)',
    '(window:keyup.space)': 'interaction.popTool()',
  },
})
export class HoldSpaceToPan {
  protected readonly interaction = inject(EpdfInteraction);

  protected press(event: KeyboardEvent) {
    if (!event.repeat) this.interaction.pushTool('pan');
  }
}
