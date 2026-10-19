/**
 * Headless services inside the viewer: a search box of the app's own, in a toolbar item, that
 * uses `inject(EpdfSearch)` from the app's own `@embedpdf/angular` against the viewer's kernel.
 * `hooks.test.ts` drives it.
 */
import { boot } from './boot';

import { Component, inject } from '@angular/core';
import { EpdfSearch, SearchToken } from '@embedpdf/angular/search';
import {
  EpdfPdfViewer,
  EpdfToolbarItem,
  SearchToken as ViewerSearchToken,
} from '@embedpdf/viewer-angular';
import type { LayoutFunction, Viewer } from '@embedpdf/viewer-angular';

import { checkRecord } from './check';

export interface HooksRecord {
  viewer: Viewer | null;
  /** Whether the app's `SearchToken` is the viewer's: one copy of the plugin. */
  sameToken: boolean;
  SearchToken: typeof SearchToken;
}

const record = checkRecord<HooksRecord>({
  viewer: null,
  sameToken: SearchToken === ViewerSearchToken,
  SearchToken,
});

@Component({
  selector: 'app-search',
  template: `
    <span data-check="search" [attr.data-status]="search.status()">
      <input data-check="query" type="search" placeholder="Search (app)" (input)="find($event)" />
      <output data-check="hits">{{ search.hitCount() }}</output>
      <output data-check="active">{{ search.activeHitIndex() }}</output>
      <button type="button" data-check="next" (click)="search.nextHit()">Next</button>
    </span>
  `,
})
export class AppSearch {
  protected readonly search = inject(EpdfSearch);

  protected find(event: Event): void {
    void this.search.search({ text: (event.target as HTMLInputElement).value });
  }
}

const layout: LayoutFunction = (base) =>
  base.add(
    { custom: 'app-search', command: 'panel:search', importance: 5 },
    { to: 'main', section: 'start', group: 'app' },
  );

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer, EpdfToolbarItem, AppSearch],
  template: `
    <epdf-pdf-viewer
      src="/sample.pdf"
      [layout]="layout"
      style="height: 100vh"
      (ready)="ready($event)"
    >
      <ng-template epdfToolbarItem="app-search"><app-search /></ng-template>
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
