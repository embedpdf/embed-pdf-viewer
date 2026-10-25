import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { withActions, withActionsUi } from '@embedpdf/angular/actions';
import { EpdfLinkLayer, withLink } from '@embedpdf/angular/link';
import { localEngine } from '@embedpdf/engine';

const links = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-links.pdf');
  return { kind: 'bytes', id: 'links', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfLinkLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: links }] },
      withStage(),
      withRender(),
      withInteraction(),
      // The actions plugin runs a link that names a viewer command, such as the footer's Next.
      withActions(),
      // The browser's way to open a website, once for the viewer.
      withActionsUi(),
      withLink(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <p class="hint">
        Every blue label is a link. Click one, or press Tab to reach it and Enter to follow it.
      </p>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-link-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
