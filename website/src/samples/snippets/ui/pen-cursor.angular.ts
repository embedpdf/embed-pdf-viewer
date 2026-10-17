import { Directive, inject, input } from '@angular/core';
import { EpdfInteraction } from '@embedpdf/angular/interaction';
import { penIcon } from './icons';

/** `<epdf-stage [appPenCursor]="color()">` */
@Directive({ selector: '[appPenCursor]' })
export class PenCursor {
  readonly color = input.required<string>({ alias: 'appPenCursor' });

  constructor() {
    // Follows the color, and gives the tool its own cursor back when the directive goes
    inject(EpdfInteraction).overrideCursor(() => ({
      toolId: 'ink',
      cursors: { crosshair: { svg: penIcon(this.color()), hotspot: { x: 2, y: 22 } } },
    }));
  }
}
