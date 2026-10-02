import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { EpdfMetadata } from '@embedpdf/angular/metadata';

@Component({
  selector: 'app-title-notice',
  template: `<p role="status">{{ notice() }}</p>`,
})
export class TitleNotice {
  private readonly metadata = inject(EpdfMetadata);

  protected readonly notice = toSignal(
    this.metadata.updated$.pipe(
      filter(({ origin }) => origin.kind === 'remote'),
      map(({ metadata }) => `The title is now "${metadata.title}"`),
    ),
    { initialValue: '' },
  );
}
