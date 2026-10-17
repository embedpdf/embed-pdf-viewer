import { Component, computed, inject, input } from '@angular/core';
import type { AnnotationRef } from '@embedpdf/angular/annotation';
import { EpdfMeasurement } from '@embedpdf/angular/measurement';

@Component({
  selector: 'app-measurement-label',
  template: `<span>{{ label() }}</span>`,
})
export class MeasurementLabel {
  readonly annotation = input.required<AnnotationRef>();

  private readonly readout = inject(EpdfMeasurement).readoutOf(this.annotation);
  // { kind: 'distance', value: 3.42, label: '3.42 m' }

  protected readonly label = computed(() => {
    const readout = this.readout();
    return 'unavailable' in readout ? '—' : readout.label;
  });
}
