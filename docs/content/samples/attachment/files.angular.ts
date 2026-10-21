import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf, saveFile } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { displayNameOf, EpdfAttachment, withAttachment } from '@embedpdf/angular/attachment';
import type { AttachedFile } from '@embedpdf/angular/attachment';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The files the document carries: attach some, save one, remove one.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withAttachment(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './files.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="layout">
        <aside class="files">
          <header class="files-header">
            <h3 class="files-title">Files</h3>
            <label class="button primary" [attr.data-disabled]="!attachment.canAdd() || null">
              Attach
              <input
                type="file"
                multiple
                hidden
                [disabled]="!attachment.canAdd()"
                (change)="attach($event)"
              />
            </label>
          </header>
          @if (attachment.files().length === 0) {
            <p class="empty">Attach a file to carry it inside the document.</p>
          } @else {
            <ul class="list">
              @for (file of attachment.files(); track file.id) {
                <li class="row" [attr.data-pending]="attachment.isPending(file) || null">
                  <button
                    type="button"
                    class="row-name"
                    [disabled]="!attachment.canDownload()"
                    (click)="save(file)"
                  >
                    <bdi>{{ nameOf(file) }}</bdi>
                    <span class="row-size">{{ sizeOf(file.size) }}</span>
                  </button>
                  <button
                    type="button"
                    class="row-remove"
                    [attr.aria-label]="'Remove ' + nameOf(file)"
                    [disabled]="!attachment.canRemove(file)"
                    (click)="attachment.remove(file)"
                  >
                    ×
                  </button>
                </li>
              }
            </ul>
          }
        </aside>

        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
          </ng-template>
        </epdf-stage>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly attachment = inject(EpdfAttachment);
  protected readonly nameOf = displayNameOf;

  /** A file's size, as people read it. */
  protected sizeOf(bytes: number | null): string {
    return bytes === null ? '' : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  }

  protected async save(file: AttachedFile) {
    const { bytes, name, mimeType } = await this.attachment.download(file);
    saveFile(bytes, name, mimeType ?? undefined);
  }

  protected attach(event: Event) {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (picked.length > 0) void this.attachment.add(picked.map((data) => ({ data })));
  }
}
