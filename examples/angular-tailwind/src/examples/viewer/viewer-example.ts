import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PDFViewer } from '@embedpdf/angular-pdf-viewer';

import { createDefaultViewerConfig, createThemePreferenceSignal } from '../../example-support';

@Component({
  selector: 'viewer-example',
  imports: [PDFViewer],
  template: `
    <section class="flex flex-col gap-4">
      <header
        class="rounded-2xl border border-slate-200 bg-white/90 p-4 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100"
      >
        <p class="text-sm font-medium text-teal-700 dark:text-teal-300">Getting started</p>
        <h2 class="mt-1 text-xl font-semibold">Drop a standalone viewer into any Angular page</h2>
        <p class="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          This starter demo keeps the configuration minimal while still responding to the
          surrounding docs site's light and dark theme.
        </p>
      </header>

      <div
        class="h-[620px] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-950"
      >
        <embedpdf-viewer class="h-full w-full" [config]="viewerConfig()" />
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ViewerExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly viewerConfig = createDefaultViewerConfig(this.themePreference);
}
