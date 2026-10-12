/**
 * The docs' zoom pill (`docs/content/snippets/viewer/components/zoom.angular.ts`), in a toolbar
 * item: it shows the zoom from `inject(EpdfStageRef)`, the viewer's own `<epdf-button>`s change
 * it, and a button of the app's runs a command with `epdfCommand`. `zoom.test.ts` drives it.
 */
import { boot } from './boot';

import { PercentPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { EpdfCommand } from '@embedpdf/angular/commands';
import { EpdfStageRef } from '@embedpdf/angular/stage';
import { EpdfButton, EpdfPdfViewer, EpdfToolbarItem } from '@embedpdf/viewer-angular';
import type { LayoutFunction, Viewer } from '@embedpdf/viewer-angular';

import { checkRecord } from './check';

export interface ZoomRecord {
  viewer: Viewer | null;
}

const record = checkRecord<ZoomRecord>({ viewer: null });

@Component({
  selector: 'app-zoom-pill',
  imports: [EpdfButton, EpdfCommand, PercentPipe],
  template: `
    <div class="zoom-pill">
      <epdf-button command="zoom:out" />
      <span data-check="level">{{ stage.zoomLevel() | percent }}</span>
      <epdf-button command="zoom:in" />
      <button class="chip" data-check="fit" [epdfCommand]="'zoom:fit-width'" #fit="epdfCommand">
        {{ fit.label() }}
      </button>
    </div>
  `,
})
export class ZoomPill {
  protected readonly stage = inject(EpdfStageRef);
}

const layout: LayoutFunction = (base) =>
  base.add({ custom: 'zoom-pill' }, { to: 'main', section: 'start' });

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer, EpdfToolbarItem, ZoomPill],
  template: `
    <epdf-pdf-viewer
      src="/sample.pdf"
      [layout]="layout"
      style="height: 100vh"
      (ready)="ready($event)"
    >
      <ng-template epdfToolbarItem="zoom-pill"><app-zoom-pill /></ng-template>
    </epdf-pdf-viewer>
  `,
})
export class App {
  protected readonly layout = layout;

  protected ready(viewer: Viewer): void {
    record.viewer = viewer;
  }
}

boot(App);
