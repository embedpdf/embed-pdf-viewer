import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfLinkLayer, EpdfLinkTemplate, withLink } from '@embedpdf/angular/link';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Where the two links go on the first page, in page coordinates.
const TO_PAGE_3 = { x: 72, y: 24, width: 160, height: 28 };
const TO_WEBSITE = { x: 250, y: 24, width: 190, height: 28 };

@Component({
  selector: 'demo-root',
  imports: [
    NgTemplateOutlet,
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfLinkLayer,
    EpdfLinkTemplate,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      // The annotation plugin is only here to make the links below.
      withAnnotation(),
      withLink(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './custom.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Link areas">
          <button type="button" [attr.aria-pressed]="shown()" (click)="shown.set(true)">
            Show link areas
          </button>
          <button type="button" [attr.aria-pressed]="!shown()" (click)="shown.set(false)">
            As the PDF has them
          </button>
        </div>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-link-layer>
            <ng-template epdfLink let-link let-native="native">
              @if (shown()) {
                <!-- Wrapping the layer's own anchor keeps what a click does. -->
                <span class="pdf-link" [attr.data-kind]="link.target.kind">
                  <ng-container [ngTemplateOutlet]="native" />
                </span>
              } @else {
                <!-- The layer's own, invisible area. -->
                <ng-container [ngTemplateOutlet]="native" />
              }
            </ng-template>
          </epdf-link-layer>
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
  protected readonly shown = signal(true);

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
