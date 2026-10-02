import { Component, computed, inject } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf, type OpenInput } from '@embedpdf/angular/runtime';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'app-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    EpdfAnnotationLayer,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
        initialDocuments: [{ source: ebook }],
      },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
      withAnnotation(),
    ),
  ],
  template: `
    <button [attr.aria-pressed]="highlighting()" (click)="toggleHighlight()">Highlight</button>

    <epdf-stage *epdfDocumentGate style="height: 500px">
      <ng-template epdfPage>
        <epdf-render-layer [annotations]="false" />
        <epdf-selection-layer />
        <epdf-annotation-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class App {
  private readonly interaction = inject(EpdfInteraction);
  protected readonly highlighting = computed(() => this.interaction.activeToolId() === 'highlight');

  protected toggleHighlight() {
    this.interaction.activateTool(this.highlighting() ? 'pointer' : 'highlight');
  }
}
