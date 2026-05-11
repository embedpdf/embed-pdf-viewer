import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PDFViewer } from '@embedpdf/angular-pdf-viewer';

import { createDefaultViewerConfig, createThemePreferenceSignal } from '../../example-support';

export const selector = 'viewer-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div
      class="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
    >
      <embedpdf-viewer class="block h-full w-full" [config]="viewerConfig()" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ViewerExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly viewerConfig = createDefaultViewerConfig(this.themePreference);
}
