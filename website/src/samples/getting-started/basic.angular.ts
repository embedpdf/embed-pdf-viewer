import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// The local engine opens bytes: fetch lazily, under the loading tab.
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The component that provides the viewer renders it: the engine is created in the browser,
// and costs nothing until the first document opens, so the page renders at once.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="height: 500px">
      <!-- Document UI is defined over a document: gate it on having one. -->
      <epdf-stage *epdfDocumentGate="let document; fallback: loading" style="height: 100%">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </div>

    <ng-template #loading><p>Loading…</p></ng-template>
  `,
})
export class App {}
