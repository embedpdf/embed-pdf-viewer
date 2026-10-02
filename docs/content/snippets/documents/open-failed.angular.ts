import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EpdfDocuments } from '@embedpdf/angular/runtime';

@Component({
  selector: 'app-open-error',
  template: `<p role="alert">{{ message() }}</p>`,
})
export class OpenError {
  private readonly documents = inject(EpdfDocuments);

  protected readonly message = toSignal(
    this.documents.openFailed$.pipe(map(({ error }) => `Couldn't open the file: ${error.message}`)),
    { initialValue: '' },
  );
}
