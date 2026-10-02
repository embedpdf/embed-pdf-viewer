import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// A pen, 24 × 24, in a color: its tip is the bottom-left corner.
const penIcon = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
  `<path d="M3 21l1.5-5.5L16 4l4 4L8.5 19.5z" fill="${color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>` +
  `</svg>`;

// The pen cursor follows the pen's color: the spec is read again when the color changes.
@Component({
  selector: 'demo-ink-cursor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class InkCursor {
  constructor() {
    const defaults = inject(EpdfAnnotation).tools.defaultsOf('ink');
    inject(EpdfInteraction).overrideCursor(() => ({
      toolId: 'ink',
      cursors: {
        crosshair: { svg: penIcon(defaults().color ?? '#000000'), hotspot: { x: 2, y: 22 } },
      },
    }));
  }
}

const COLORS = ['#e5484d', '#1e90ff', '#30a46c', '#1a2748'];

@Component({
  selector: 'demo-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button
        type="button"
        class="button"
        [attr.aria-pressed]="interaction.activeToolId() === 'ink'"
        (click)="interaction.activateTool('ink')"
      >
        Pen
      </button>
      <div class="swatches" role="group" aria-label="Pen color">
        @for (swatch of colors; track swatch) {
          <button
            type="button"
            class="swatch"
            [attr.aria-label]="swatch"
            [attr.aria-pressed]="defaults().color === swatch"
            [style.background]="swatch"
            (click)="pick(swatch)"
          ></button>
        }
      </div>
      <button
        type="button"
        class="button"
        [attr.aria-pressed]="interaction.activeToolId() === 'square'"
        (click)="interaction.activateTool('square')"
      >
        Rectangle
      </button>
    </div>
  `,
})
export class Toolbar {
  protected readonly colors = COLORS;
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly defaults = this.annotation.tools.defaultsOf('ink');

  constructor() {
    // The pen is active on load: move the pointer over the page.
    this.interaction.activateTool('ink');
  }

  protected pick(swatch: string) {
    this.annotation.tools.updateDefaults('ink', { color: swatch });
    this.interaction.activateTool('ink');
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    InkCursor,
    Toolbar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      // A standard cursor for the rectangle tool: any CSS cursor name.
      withAnnotation({ tools: [{ id: 'square', cursor: 'cell' }] }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cursor.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-ink-cursor />
      <demo-toolbar />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer [annotations]="false" />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
