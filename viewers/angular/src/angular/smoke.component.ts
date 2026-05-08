// Smoke fixture: exists so the Analog Vite plugin has a real @Component to
// transform end-to-end (template + decorator + d.ts). Not part of the public API.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { scratchLabel } from '../shared';

@Component({
  selector: 'embedpdf-smoke',
  template: `<p>{{ label() }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmokeComponent {
  readonly label = input(scratchLabel);
}
