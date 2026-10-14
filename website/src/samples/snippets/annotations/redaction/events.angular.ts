import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EpdfRedaction } from '@embedpdf/angular/redaction';

@Component({
  selector: 'app-redaction-notice',
  template: `<p aria-live="polite">{{ message() }}</p>`,
})
export class RedactionNotice {
  private readonly redaction = inject(EpdfRedaction);

  protected readonly message = toSignal(
    this.redaction.applied$.pipe(map(() => 'Redacted: the content under the marks is gone')),
    { initialValue: '' },
  );
}
