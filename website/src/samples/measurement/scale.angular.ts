import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import {
  EpdfMeasurement,
  withMeasurement,
  type AreaUnit,
  type LengthUnit,
} from '@embedpdf/angular/measurement';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Precision is steps per unit: 100 shows two decimals.
const PRECISIONS = [1, 10, 100, 1000];

// The cover's empty lower half, where the measurements go.
const LOWER_HALF = { x: 40, y: 560, width: 532, height: 210 };

@Component({
  selector: 'demo-scale-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <label class="label">
        Scale
        <select
          #presetField
          class="field"
          [disabled]="measurement.busy()"
          (change)="setPreset(presetField.value)"
        >
          @for (choice of presets; track choice.id) {
            <option [value]="choice.id" [selected]="choice.id === preset()">
              {{ choice.label }}
            </option>
          }
        </select>
      </label>
      <label class="label">
        Length
        <select
          #unitField
          class="field"
          [disabled]="measurement.busy()"
          (change)="setUnit(unitField.value)"
        >
          @for (choice of units; track choice) {
            <option [value]="choice" [selected]="choice === unit()">{{ choice }}</option>
          }
        </select>
      </label>
      <label class="label">
        Area
        <select
          #areaUnitField
          class="field"
          [disabled]="measurement.busy()"
          (change)="setAreaUnit(areaUnitField.value)"
        >
          @for (choice of areaUnits; track choice) {
            <option [value]="choice" [selected]="choice === areaUnit()">{{ choice }}</option>
          }
        </select>
      </label>
      <label class="label">
        Steps
        <select
          #precisionField
          class="field"
          [disabled]="measurement.busy()"
          (change)="setPrecision(+precisionField.value)"
        >
          @for (choice of precisions; track choice) {
            <option [value]="choice" [selected]="choice === precision()">
              {{ choice === 1 ? 'Whole' : '1/' + choice }}
            </option>
          }
        </select>
      </label>
      <span class="spacer"></span>
      <output class="badge">{{ ratio() }}</output>
    </div>
  `,
})
export class ScaleToolbar {
  protected readonly measurement = inject(EpdfMeasurement);
  protected readonly presets = this.measurement.listPresets();
  protected readonly units = this.measurement.listUnits();
  protected readonly areaUnits = this.measurement.listAreaUnits();
  protected readonly precisions = PRECISIONS;
  protected readonly preset = signal('metric-100');
  protected readonly unit = signal<LengthUnit>('m');
  protected readonly areaUnit = signal<AreaUnit>('m2');
  protected readonly precision = signal(100);
  private readonly scale = this.measurement.scaleOf(0);
  protected readonly ratio = computed(() => {
    const measure = this.scale().measure;
    return measure?.subtype === 'rectilinear' ? measure.ratio : '…';
  });

  // Every change recalculates the measurements already on the page.
  protected setPreset(preset: string) {
    this.preset.set(preset);
    void this.measurement.setPreset(0, preset);
  }

  // A <select> gives a string: one of the units the plugin listed.
  protected setUnit(value: string) {
    const unit = value as LengthUnit;
    this.unit.set(unit);
    void this.measurement.setUnit(0, unit);
  }

  protected setAreaUnit(value: string) {
    const unit = value as AreaUnit;
    this.areaUnit.set(unit);
    void this.measurement.setAreaUnit(0, unit);
  }

  protected setPrecision(precision: number) {
    this.precision.set(precision);
    void this.measurement.setPrecision(0, precision);
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
    ScaleToolbar,
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
  styleUrl: './scale.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-scale-toolbar />
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
export class App {
  private readonly measurement = inject(EpdfMeasurement);
  private readonly coverScale = this.measurement.scaleOf(0);
  private readonly stage = viewChild(EpdfStage);
  private started = false;

  constructor() {
    // On load: a distance and an area on the cover, at 1:100, scrolled into view.
    effect(() => {
      const stage = this.stage();
      if (!stage || !this.coverScale().ready || this.started) return;
      this.started = true;
      untracked(() => this.measureCover(stage));
    });
  }

  private measureCover(stage: EpdfStage) {
    void this.measurement.setPreset(0, 'metric-100').then(() =>
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
          kind: 'area',
          page: 0,
          points: [
            { x: 60, y: 580 },
            { x: 260, y: 580 },
            { x: 260, y: 700 },
            { x: 60, y: 700 },
          ],
        }),
      ]).then(() => stage.reveal(0, { rect: LOWER_HALF })),
    );
  }
}
