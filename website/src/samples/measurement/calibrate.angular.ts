import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import {
  EpdfMeasurement,
  withMeasurement,
  type CalibrationRequest,
  type LengthUnit,
} from '@embedpdf/angular/measurement';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'demo-calibration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The plugin asks for the real length of the line you drew. -->
    @if (measurement.calibrationRequest(); as request) {
      <form class="toolbar" (submit)="$event.preventDefault(); calibrate(request)">
        <span class="readout">That line is</span>
        <input
          #lengthField
          class="field length"
          type="number"
          min="0"
          step="any"
          aria-label="Its real length"
          [value]="length()"
          (input)="length.set(lengthField.value)"
        />
        <select #unitField class="field" aria-label="Unit" (change)="setUnit(unitField.value)">
          @for (choice of units; track choice) {
            <option [value]="choice" [selected]="choice === unit()">{{ choice }}</option>
          }
        </select>
        <button type="submit" class="button" [disabled]="measurement.busy() || !(value() > 0)">
          Set the scale
        </button>
        <button type="button" class="button" (click)="measurement.dismissCalibration()">
          Cancel
        </button>
      </form>
    } @else {
      <div class="toolbar">
        <button
          type="button"
          class="button"
          [disabled]="!measurement.canCalibrate()"
          (click)="measurement.startCalibration()"
        >
          Calibrate
        </button>
        <output class="readout">
          Drag along something you know the length of, then measure with the new scale
        </output>
        <span class="spacer"></span>
        <output class="badge">{{ ratio() }}</output>
      </div>
    }
  `,
})
export class Calibration {
  protected readonly measurement = inject(EpdfMeasurement);
  private readonly interaction = inject(EpdfInteraction);
  protected readonly units = this.measurement.listUnits();
  protected readonly length = signal('20');
  protected readonly value = computed(() => Number(this.length()));
  protected readonly unit = signal<LengthUnit>('cm');
  private readonly scale = this.measurement.scaleOf(0);
  protected readonly ratio = computed(() => {
    const measure = this.scale().measure;
    return measure?.subtype === 'rectilinear' ? measure.ratio : '…';
  });
  private started = false;

  constructor() {
    // On load: calibrating, so the next line you drag is the known length.
    effect(() => {
      if (!this.scale().ready || this.started) return;
      this.started = true;
      untracked(() => {
        if (this.measurement.canCalibrate()) this.measurement.startCalibration();
      });
    });
  }

  // A <select> gives a string: one of the units the plugin listed.
  protected setUnit(value: string) {
    this.unit.set(value as LengthUnit);
  }

  protected calibrate(request: CalibrationRequest) {
    void this.measurement
      .calibrate({ ...request, distance: { value: this.value(), unit: this.unit() } })
      .then(() => this.interaction.activateTool('distance'));
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
    Calibration,
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
  styleUrl: './calibrate.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-calibration />
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
