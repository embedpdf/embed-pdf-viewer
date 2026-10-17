import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocument,
  EpdfDocumentGate,
  EpdfDocuments,
  EpdfDocumentScope,
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

// The same component in both panes: each talks to the document its [epdfDocumentScope] names.
@Component({
  selector: 'demo-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header">
      <strong>{{ document.name() }}</strong>
      {{ document.pageCount() }} pages
      <button type="button" class="button" aria-label="Zoom out" (click)="stage().zoomOut()">
        −
      </button>
      <output class="readout">{{ percent(stage().zoomLevel()) }}%</output>
      <button type="button" class="button" aria-label="Zoom in" (click)="stage().zoomIn()">
        +
      </button>
    </div>
  `,
})
export class Header {
  readonly stage = input.required<EpdfStage>();
  protected readonly document = inject(EpdfDocument);

  protected percent(zoomLevel: number): number {
    return Math.round(zoomLevel * 100);
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentScope,
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    Header,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
        initialDocuments: [
          { source: ebook, name: 'Original' },
          { source: ebook, name: 'Revised' },
        ],
      },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './scope.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="split">
      @for (document of documents.documents(); track document.id) {
        <section class="pane" [epdfDocumentScope]="document.id">
          <ng-container *epdfDocumentGate="let ready; fallback: opening">
            <demo-header [stage]="stage" />
            <epdf-stage #stage="epdfStage" class="stage">
              <ng-template epdfPage>
                <epdf-render-layer />
              </ng-template>
            </epdf-stage>
          </ng-container>
        </section>
      }
    </div>

    <ng-template #opening><p class="loading">Opening…</p></ng-template>
  `,
})
export class App {
  protected readonly documents = inject(EpdfDocuments);
}
