import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-sidebar',
  template: `
    @if (sidebarOpen()) {
      <aside><!-- … --></aside>
    }
  `,
})
export class Sidebar {
  private readonly annotation = inject(EpdfAnnotation);

  protected readonly sidebarOpen = toSignal(
    this.annotation.selectionChanged$.pipe(map(({ refs }) => refs.length > 0)),
    { initialValue: false },
  );
}
