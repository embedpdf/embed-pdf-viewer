import { Component, computed, signal } from '@angular/core';
import { epdfTheme } from '@embedpdf/angular/runtime';

import { Pages } from './pages';

@Component({
  selector: 'app-branded-viewer',
  imports: [Pages],
  template: `
    <div class="pdf-viewer" [style]="theme()">
      <input #picker type="color" [value]="accent()" (input)="accent.set(picker.value)" />
      <app-pages />
    </div>
  `,
})
export class BrandedViewer {
  protected readonly accent = signal('#e91e63');
  protected readonly theme = computed(() => epdfTheme({ accent: this.accent() }));
}
