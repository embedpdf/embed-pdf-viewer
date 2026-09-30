import { Component, inject } from '@angular/core';
import { EpdfMeasurement, type CalibrationRequest } from '@embedpdf/angular/measurement';

import { LengthPrompt } from './length-prompt';

@Component({
  selector: 'app-calibration-dialog',
  imports: [LengthPrompt],
  template: `
    @if (measurement.calibrationRequest(); as request) {
      <app-length-prompt
        (submitted)="apply(request, $event)"
        (cancelled)="measurement.dismissCalibration()"
      />
    }
  `,
})
export class CalibrationDialog {
  protected readonly measurement = inject(EpdfMeasurement);

  protected apply(request: CalibrationRequest, value: number) {
    void this.measurement.calibrate({ ...request, distance: { value, unit: 'cm' } });
  }
}
