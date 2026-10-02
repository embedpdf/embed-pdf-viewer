import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfMeasurement, withMeasurement } from '@embedpdf/angular/measurement';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'distance', label: 'Distance' },
  { id: 'perimeter', label: 'Perimeter' },
  { id: 'area', label: 'Area' },
];

@Component({
  selector: 'demo-measure-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Tool">
        @for (tool of tools; track tool.id) {
          <button
            type="button"
            [attr.aria-pressed]="interaction.activeToolId() === tool.id"
            (click)="interaction.activateTool(tool.id)"
          >
            {{ tool.label }}
          </button>
        }
      </div>
      <span class="spacer"></span>
      <output class="badge">Scale {{ ratio() }}</output>
    </div>
  `,
})
export class MeasureToolbar {
  protected readonly interaction = inject(EpdfInteraction);
  private readonly measurement = inject(EpdfMeasurement);
  protected readonly tools = TOOLS;
  private readonly scale = this.measurement.scaleOf(0); // the cover's scale
  protected readonly ratio = computed(() => {
    const measure = this.scale().measure;
    return measure?.subtype === 'rectilinear' ? measure.ratio : '…';
  });
  private started = false;

  constructor() {
    // On load: the cover at 1:100, its width measured along the top, and the distance tool on.
    effect(() => {
      if (!this.scale().ready || this.started) return;
      this.started = true;
      void this.measurement
        .setPreset(0, 'metric-100')
        .then(() =>
          this.measurement.createMeasurement({
            kind: 'distance',
            page: 0,
            points: [
              { x: 30, y: 28 },
              { x: 582, y: 28 },
            ],
          }),
        )
        .then(() => this.interaction.activateTool('distance'));
    });
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
    MeasureToolbar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withMeasurement(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-measure-toolbar />
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
