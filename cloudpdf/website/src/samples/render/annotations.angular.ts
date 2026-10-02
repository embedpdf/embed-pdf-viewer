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
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

type Painter = 'picture' | 'layer';

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfAnnotationLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './annotations.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Who draws the annotations">
          <button
            type="button"
            [attr.aria-pressed]="painter() === 'picture'"
            (click)="painter.set('picture')"
          >
            In the page picture
          </button>
          <button
            type="button"
            [attr.aria-pressed]="painter() === 'layer'"
            (click)="painter.set('layer')"
          >
            Drawn by the annotation layer
          </button>
        </div>
        <p class="hint">
          @if (painter() === 'picture') {
            Part of the picture: it can’t be picked up.
          } @else {
            Left out of the picture: click it, then drag it.
          }
        </p>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          @if (painter() === 'picture') {
            <epdf-render-layer />
          } @else {
            <epdf-render-layer [annotations]="false" />
            <epdf-annotation-layer />
          }
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
  protected readonly painter = signal<Painter>('picture');

  constructor() {
    // A rectangle on the first page, made on load so there's an annotation to show.
    effect(() => {
      const firstPage = this.document.pages()[0]?.ref;
      if (!firstPage || this.added) return;
      this.added = true;
      untracked(
        () =>
          void this.annotation.create(firstPage, {
            subtype: 'square',
            box: { x: 72, y: 96, width: 300, height: 140 },
            color: '#e11d48',
            interiorColor: '#ffe4e6',
            opacity: 0.7,
            strokeWidth: 3,
          }),
      );
    });
  }
}
