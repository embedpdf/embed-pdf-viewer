import { Component, inject } from '@angular/core';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';
import { EpdfInteraction } from '@embedpdf/angular/interaction';

import { penIcon } from './icons';

@Component({
  selector: 'app-ink-cursor',
  template: '',
})
export class InkCursor {
  private readonly defaults = inject(EpdfAnnotation).tools.defaultsOf('ink');

  constructor() {
    // Follows the color, and gives the tool its own cursor back when this component goes
    inject(EpdfInteraction).overrideCursor(() => ({
      toolId: 'ink',
      cursors: { crosshair: { svg: penIcon(this.defaults().color), hotspot: { x: 2, y: 22 } } },
    }));
  }
}
