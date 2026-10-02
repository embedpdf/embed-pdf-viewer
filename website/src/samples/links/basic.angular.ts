import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfLinkLayer, withLink } from '@embedpdf/angular/link';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Where the two links go on the first page, in page coordinates.
const TO_PAGE_3 = { x: 72, y: 24, width: 160, height: 28 };
const TO_WEBSITE = { x: 250, y: 24, width: 190, height: 28 };

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfLinkLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      // The annotation plugin is only here to make the links below.
      withAnnotation(),
      withLink(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <p class="hint">
        Two links at the top of the first page. Click one, or press Tab to reach it and Enter to
        follow it.
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
export class App {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly document = inject(EpdfDocument);
  private added = false;

  constructor() {
    // Made on load, since the document has none: a label the page shows, and a link over it.
    effect(() => {
      const [first, , third] = this.document.pages();
      if (!first || !third || this.added) return;
      this.added = true;
      untracked(() => void this.addLinks(first.ref, third.ref));
    });
  }

  private async addLinks(first: PageRef, third: PageRef) {
    const label = (text: string, box: typeof TO_PAGE_3) =>
      this.annotation.create(first, {
        subtype: 'free-text',
        box,
        contents: text,
        fontSize: 13,
        fontColor: '#054fb3',
        interiorColor: '#e8f1ff',
        color: '#7db6ff',
        strokeWidth: 1,
      });
    await label('Go to page 3 →', TO_PAGE_3);
    await label('Open embedpdf.com ↗', TO_WEBSITE);
    await this.annotation.create(first, {
      subtype: 'link',
      rect: TO_PAGE_3,
      target: { kind: 'goto', destination: { kind: 'fit', page: third } },
    });
    await this.annotation.create(first, {
      subtype: 'link',
      rect: TO_WEBSITE,
      target: { kind: 'uri', uri: 'https://www.embedpdf.com' },
    });
  }
}
