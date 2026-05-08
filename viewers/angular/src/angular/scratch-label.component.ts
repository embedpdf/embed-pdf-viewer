import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { scratchLabel } from '../shared';

@Component({
  standalone: true,
  selector: 'embedpdf-scratch-label',
  template: `<p>{{ label() }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScratchLabelComponent {
  readonly label = input(scratchLabel);
}
