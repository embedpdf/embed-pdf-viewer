import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { EpdfAttachment } from '@embedpdf/angular/attachment';

@Component({
  selector: 'app-attachment-notice',
  template: `<p role="status">{{ notice() }}</p>`,
})
export class AttachmentNotice {
  private readonly attachment = inject(EpdfAttachment);

  protected readonly notice = toSignal(
    this.attachment.changed$.pipe(
      filter(({ origin }) => origin.kind === 'remote'),
      map(({ type, files }) => `Someone ${type} ${files.length} file(s)`),
    ),
    { initialValue: '' },
  );
}
