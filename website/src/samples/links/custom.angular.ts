import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { withActions, withActionsUi } from '@embedpdf/angular/actions';
import { EpdfLinkLayer, EpdfLinkTemplate, withLink } from '@embedpdf/angular/link';
import { localEngine } from '@embedpdf/engine';

const links = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/links.pdf');
  return { kind: 'bytes', id: 'links', bytes: new Uint8Array(await response.arrayBuffer()) };
};

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
  protected readonly shown = signal(true);
}
