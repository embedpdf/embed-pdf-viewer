import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EpdfMeasurement } from '@embedpdf/angular/measurement';

@Component({
  selector: 'app-scale-notice',
  template: `<p aria-live="polite">{{ message() }}</p>`,
})
export class ScaleNotice {
  private readonly measurement = inject(EpdfMeasurement);

  protected readonly message = toSignal(
    this.measurement.scaleChanged$.pipe(map(() => 'The scale changed')),
    { initialValue: '' },
  );
}
