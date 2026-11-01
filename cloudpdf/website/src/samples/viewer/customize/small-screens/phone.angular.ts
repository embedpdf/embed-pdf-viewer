import { Component, ViewEncapsulation } from '@angular/core';
import { EpdfPdfViewer, type Layout, type LayoutEnv } from '@cloudpdf/viewer-angular';

const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  styleUrl: './phone.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="phone">
      <epdf-pdf-viewer [src]="welcome" [layout]="layout" style="height: 100%" />
    </div>
  `,
})
export class App {
  readonly welcome = welcome;
  readonly layout = (layout: Layout, env: LayoutEnv) =>
    env.size === 'compact' ? layout.place('main', 'bottom') : layout;
}
