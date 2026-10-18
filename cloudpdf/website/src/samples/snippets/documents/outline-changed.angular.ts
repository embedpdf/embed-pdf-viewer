import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { EpdfOutline } from '@embedpdf/angular/outline';

@Component({
  selector: 'app-outline-notice',
  template: `<p role="status">{{ notice() }}</p>`,
})
export class OutlineNotice {
  private readonly outline = inject(EpdfOutline);

  protected readonly notice = toSignal(
    this.outline.changed$.pipe(
      filter(({ origin }) => origin.kind === 'remote'),
      map(({ type, items }) => `Someone ${type} ${items.length} bookmark(s)`),
    ),
    { initialValue: '' },
  );
}
