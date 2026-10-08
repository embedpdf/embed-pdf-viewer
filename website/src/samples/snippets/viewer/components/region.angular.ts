import { Component } from '@angular/core';
import { EpdfPdfViewer, EpdfRegion } from '@embedpdf/viewer-angular';
import { AppHeader, RecentFiles } from './app'; // your app

@Component({
  selector: 'app-workspace',
  imports: [EpdfPdfViewer, EpdfRegion, AppHeader, RecentFiles],
  template: `
    <epdf-pdf-viewer style="height: 100vh">
      <ng-template epdfRegion="header"><app-header /></ng-template>
      <ng-template epdfRegion="empty"><app-recent-files /></ng-template>
    </epdf-pdf-viewer>
  `,
})
export class Workspace {}
