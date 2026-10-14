import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocumentGate,
  EpdfDocuments,
  provideEmbedPdf,
  saveFile,
} from '@embedpdf/angular/runtime';
import type { OpenInput, PdfSaveMode } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const megabytes = (bytes: Uint8Array) => `${(bytes.byteLength / 1_000_000).toFixed(2)} MB`;

@Component({
  selector: 'demo-download-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Kind of download">
        <button
          type="button"
          [attr.aria-pressed]="mode() === 'incremental'"
          (click)="mode.set('incremental')"
        >
          Incremental
        </button>
        <button
          type="button"
          [attr.aria-pressed]="mode() === 'rewrite'"
          (click)="mode.set('rewrite')"
        >
          Rewrite
        </button>
      </div>
      <button
        type="button"
        class="download"
        [disabled]="!documents.canDownload()"
        (click)="download()"
      >
        Download
      </button>
      <output class="sizes">
        @if (sizes(); as sizes) {
          Incremental <strong>{{ sizes.incremental }}</strong> · Rewrite
          <strong>{{ sizes.rewrite }}</strong>
        } @else {
          Measuring…
        }
      </output>
    </div>
  `,
})
export class DownloadBar {
  protected readonly documents = inject(EpdfDocuments);
  protected readonly mode = signal<PdfSaveMode>('incremental');
  protected readonly sizes = signal<Record<PdfSaveMode, string> | null>(null);

  constructor() {
    // How big each kind of download is: the same document, written two ways.
    const cancel = new AbortController();
    inject(DestroyRef).onDestroy(() => cancel.abort());
    Promise.all([
      this.documents.download(undefined, { signal: cancel.signal }),
      this.documents.download(undefined, { mode: 'rewrite', signal: cancel.signal }),
    ])
      .then(([incremental, rewrite]) =>
        this.sizes.set({ incremental: megabytes(incremental), rewrite: megabytes(rewrite) }),
      )
      .catch(() => {}); // cancelled: the example went away
  }

  protected async download() {
    saveFile(await this.documents.download(undefined, { mode: this.mode() }), 'ebook.pdf');
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, DownloadBar],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook, name: 'ebook.pdf' }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './download.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: opening">
      <demo-download-bar />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #opening><p class="loading">Opening…</p></ng-template>
  `,
})
export class App {}
