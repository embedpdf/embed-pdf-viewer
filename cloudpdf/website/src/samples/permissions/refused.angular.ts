import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocumentGate,
  EpdfDocuments,
  isPluginError,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Read and select, but no downloading.
const scope = ['doc.open', 'doc.render', 'doc.text.select'];

/** What the last download did: the bytes, or why it was refused. */
type Result =
  | { kind: 'downloaded'; byteLength: number }
  | { kind: 'refused'; code: string; permission: string | null };

@Component({
  selector: 'demo-download-anyway',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button type="button" class="button" (click)="download()">Download anyway</button>
      <output class="result">
        @if (result(); as result) {
          @if (result.kind === 'downloaded') {
            Downloaded {{ result.byteLength }} bytes.
          } @else {
            Refused: <code>{{ result.code }}</code
            >, missing <code>{{ result.permission }}</code>
          }
        }
      </output>
    </div>
  `,
})
export class DownloadAnyway {
  private readonly documents = inject(EpdfDocuments);
  protected readonly result = signal<Result | null>(null);

  constructor() {
    // On load, the call the button makes, so the refusal shows at once.
    void this.download();
  }

  protected async download() {
    try {
      const bytes = await this.documents.download();
      this.result.set({ kind: 'downloaded', byteLength: bytes.byteLength });
    } catch (error) {
      if (isPluginError(error, 'permission-denied')) {
        this.result.set({ kind: 'refused', code: error.code, permission: error.permission });
      }
    }
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, DownloadAnyway],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), scope, initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './refused.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: opening">
      <demo-download-anyway />
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
