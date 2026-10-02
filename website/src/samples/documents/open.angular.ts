import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import {
  EpdfDocument,
  EpdfDocumentGate,
  EpdfDocuments,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook, name: 'ebook.pdf' }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './open.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="toolbar">
      <span class="document">
        @if (document.id()) {
          <strong>{{ document.name() ?? 'Untitled' }}</strong>
          {{
            document.status() === 'ready'
              ? ' · ' + document.pageCount() + ' pages'
              : ' · ' + document.status()
          }}
        } @else {
          No document open
        }
      </span>
      <label class="button picker">
        Open a PDF…
        <input #picker type="file" accept="application/pdf" (change)="pick(picker)" />
      </label>
      @if (document.id()) {
        <button type="button" class="button" (click)="documents.close(document.id())">Close</button>
      } @else {
        <button type="button" class="button" (click)="documents.open(ebook, { name: 'ebook.pdf' })">
          Open the ebook again
        </button>
      }
    </div>

    <epdf-stage *epdfDocumentGate="let ready; fallback: empty" class="stage">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>

    <!-- The gate's fallback: a document on its way, or none at all. -->
    <ng-template #empty>
      <p class="loading">
        {{ document.id() ? 'Opening…' : 'No document is open. Open a PDF to see it here.' }}
      </p>
    </ng-template>
  `,
})
export class App {
  protected readonly documents = inject(EpdfDocuments);
  protected readonly document = inject(EpdfDocument);
  protected readonly ebook = ebook;

  // A file the user picks opens next to the ebook, and becomes the active document.
  protected async pick(picker: HTMLInputElement) {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    await this.documents.open(
      { kind: 'bytes', bytes: await file.arrayBuffer() },
      { name: file.name },
    );
  }
}
