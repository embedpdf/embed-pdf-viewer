import { Component, inject } from '@angular/core';
import { EpdfI18n } from '@embedpdf/angular/i18n';

@Component({
  selector: 'app-viewer-root',
  template: `
    <div [dir]="i18n.direction()">
      <!-- your viewer -->
    </div>
  `,
})
export class ViewerRoot {
  protected readonly i18n = inject(EpdfI18n);
}
