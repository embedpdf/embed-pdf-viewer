import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EpdfStamp } from '@embedpdf/angular/stamp';

@Component({
  selector: 'app-library-status',
  template: `<p aria-live="polite">{{ message() }}</p>`,
})
export class LibraryStatus {
  private readonly stamp = inject(EpdfStamp);

  protected readonly message = toSignal(
    this.stamp.libraryChanged$.pipe(map(({ libraryId, reason }) => `${libraryId}: ${reason}`)),
    { initialValue: '' },
  );
}
