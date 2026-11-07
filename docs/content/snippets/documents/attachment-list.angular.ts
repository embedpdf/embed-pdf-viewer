import { Component, inject } from '@angular/core';
import { displayNameOf, EpdfAttachment } from '@embedpdf/angular/attachment';
import type { AttachedFile } from '@embedpdf/angular/attachment';
import { saveFile } from '@embedpdf/angular/runtime';

@Component({
  selector: 'app-attachment-list',
  template: `
    <ul>
      @for (file of attachment.files(); track file.id) {
        <li>
          <bdi>{{ nameOf(file) }}</bdi>
          <button [disabled]="!attachment.canDownload()" (click)="save(file)">Save</button>
        </li>
      }
    </ul>
  `,
})
export class AttachmentList {
  protected readonly attachment = inject(EpdfAttachment);
  protected readonly nameOf = displayNameOf;

  protected async save(file: AttachedFile) {
    const { bytes, name, mimeType } = await this.attachment.download(file);
    saveFile(bytes, name, mimeType ?? undefined);
  }
}
