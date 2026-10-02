import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  annotationKey,
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
  type Annotation,
} from '@embedpdf/angular/annotation';
import { EpdfMeasurement, withMeasurement } from '@embedpdf/angular/measurement';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The cover's empty lower half, where the measurements go.
const LOWER_HALF = { x: 40, y: 560, width: 532, height: 210 };

// A measurement is a line, polyline or polygon with a dimension intent.
const isMeasurement = (annotation: Annotation) =>
  'intent' in annotation && !!annotation.intent?.endsWith('-dimension');

@Component({
  selector: 'li[demoReadout]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="row" (click)="select()">
      <span class="kind">{{ kind() }}</span>
      <span class="value">{{ value() }}</span>
    </button>
  `,
})
export class Readout {
  readonly annotation = input.required<Annotation>();

  private readonly selection = inject(EpdfAnnotation).selection;
  private readonly readout = inject(EpdfMeasurement).readoutOf(() => this.annotation().ref);
  protected readonly kind = computed(() => {
    const readout = this.readout();
    return 'unavailable' in readout ? 'No scale' : readout.kind;
  });
  protected readonly value = computed(() => {
    const readout = this.readout();
    return 'unavailable' in readout ? '—' : readout.label;
  });

  protected select() {
    this.selection.set([this.annotation().ref]);
  }
}

@Component({
  selector: 'ul[demoReadouts]',
  imports: [Readout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'readouts', 'aria-label': 'Measurements on the cover' },
  template: `
    @for (annotation of measurements(); track key(annotation.ref)) {
      <li demoReadout [annotation]="annotation"></li>
    }
  `,
})
export class Readouts {
  private readonly onCover = inject(EpdfAnnotation).watch({ pages: [0] });
  protected readonly measurements = computed(() => this.onCover().filter(isMeasurement));
  protected readonly key = annotationKey;
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    Readouts,
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
  styleUrl: './readout.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="viewer">
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer [annotations]="false" />
            <epdf-annotation-layer />
          </ng-template>
        </epdf-stage>
        <ul demoReadouts></ul>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly measurement = inject(EpdfMeasurement);
  private readonly coverScale = this.measurement.scaleOf(0);
  private readonly stage = viewChild(EpdfStage);
  private started = false;

  constructor() {
    // On load: the cover at 1:50, and one measurement of each kind on it, scrolled into view.
    effect(() => {
      const stage = this.stage();
      if (!stage || !this.coverScale().ready || this.started) return;
      this.started = true;
      untracked(() => this.measureCover(stage));
    });
  }

  private measureCover(stage: EpdfStage) {
    void this.measurement.setPreset(0, 'metric-50').then(() =>
      Promise.all([
        this.measurement.createMeasurement({
          kind: 'distance',
          page: 0,
          points: [
            { x: 60, y: 740 },
            { x: 550, y: 740 },
          ],
        }),
        this.measurement.createMeasurement({
          kind: 'perimeter',
          page: 0,
          points: [
            { x: 60, y: 580 },
            { x: 160, y: 640 },
            { x: 260, y: 590 },
          ],
        }),
        this.measurement.createMeasurement({
          kind: 'area',
          page: 0,
          points: [
            { x: 80, y: 650 },
            { x: 250, y: 650 },
            { x: 250, y: 710 },
            { x: 80, y: 710 },
          ],
        }),
      ]).then(() => stage.reveal(0, { rect: LOWER_HALF })),
    );
  }
}
