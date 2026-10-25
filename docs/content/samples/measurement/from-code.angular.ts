import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import {
  EpdfMeasurement,
  withMeasurement,
  type MeasurementKind,
} from '@embedpdf/angular/measurement';
import { localEngine } from '@embedpdf/engine';

// [!doc-source sketch]
const sketch = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-sketch.pdf');
  return { kind: 'bytes', id: 'sketch', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// Points on the floor plan, in page coordinates: two for a
// distance, the corners otherwise.
const SHAPES: Record<MeasurementKind, { x: number; y: number }[]> = {
  distance: [
    { x: 62, y: 723 },
    { x: 550, y: 723 },
  ],
  perimeter: [
    { x: 62, y: 613 },
    { x: 382, y: 613 },
    { x: 382, y: 723 },
  ],
  area: [
    { x: 382, y: 516 },
    { x: 550, y: 516 },
    { x: 550, y: 723 },
    { x: 382, y: 723 },
  ],
};

// The floor plan's lower half, where the measurements go.
const LOWER_HALF = { x: 50, y: 500, width: 512, height: 240 };

/** Next to `<epdf-stage #stage="epdfStage">`: `<demo-measure-buttons [stage]="stage" />`. */
@Component({
  selector: 'demo-measure-buttons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button
        type="button"
        class="button"
        [disabled]="!scale().ready"
        (click)="measure('distance')"
      >
        Distance
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!scale().ready"
        (click)="measure('perimeter')"
      >
        Perimeter
      </button>
      <button type="button" class="button" [disabled]="!scale().ready" (click)="measure('area')">
        Area
      </button>
      <span class="spacer"></span>
      <output class="readout">
        {{ count() }} {{ count() === 1 ? 'measurement' : 'measurements' }} on the plan
      </output>
    </div>
  `,
})
export class MeasureButtons {
  readonly stage = input.required<EpdfStage>();

  private readonly measurement = inject(EpdfMeasurement);
  protected readonly scale = this.measurement.scaleOf(0);
  private readonly onPlan = inject(EpdfAnnotation).watch({ pages: [0] });
  protected readonly count = computed(
    () =>
      this.onPlan().filter(
        (annotation) => 'intent' in annotation && !!annotation.intent?.endsWith('-dimension'),
      ).length,
  );
  private started = false;

  constructor() {
    // On load: an area, scrolled into view.
    effect(() => {
      if (!this.scale().ready || this.started) return;
      this.started = true;
      const stage = this.stage();
      void this.measurement
        .createMeasurement({ kind: 'area', page: 0, points: SHAPES.area })
        .then(() => stage.reveal(0, { rect: LOWER_HALF }));
    });
  }

  // The same measurement the tool makes, with the page's scale and the tool's style.
  protected measure(kind: MeasurementKind) {
    void this.measurement.createMeasurement({ kind, page: 0, points: SHAPES[kind] });
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
    MeasureButtons,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: sketch }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withMeasurement(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './from-code.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-measure-buttons [stage]="stage" />
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
