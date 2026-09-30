import { Directive, inject } from '@angular/core';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';
import { EpdfInteraction } from '@embedpdf/angular/interaction';

// <div appAnnotationKeys>…</div>, on any element under the viewer's providers
@Directive({
  selector: '[appAnnotationKeys]',
  host: { '(window:keydown)': 'onKey($event)' },
})
export class AnnotationKeys {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly interaction = inject(EpdfInteraction);

  protected onKey(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || this.annotation.text.getEditing()) return;
    if (event.key === 'Delete' || event.key === 'Backspace') void this.annotation.selection.delete();
    if (event.key === 'Escape') {
      this.annotation.cancel(); // a drag or a polygon in progress
      this.interaction.activateDefaultTool();
    }
  }
}
