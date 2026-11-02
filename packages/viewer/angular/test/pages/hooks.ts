/**
 * Headless services inside the viewer: a search box of the app's own, in a toolbar item, that
 * uses `inject(EpdfSearch)` from the app's own `@embedpdf/angular` against the viewer's kernel,
 * and the metadata, outline, attachment and fonts services read beside it. `hooks.test.ts`
 * drives it.
 */
import { boot } from './boot';

import { Component, inject } from '@angular/core';
import { EpdfAttachment } from '@embedpdf/angular/attachment';
import { EpdfFonts } from '@embedpdf/angular/fonts';
import { EpdfMetadata } from '@embedpdf/angular/metadata';
import { EpdfOutline } from '@embedpdf/angular/outline';
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

/** The services of the plugins that read a document on demand, from inside the viewer. */
@Component({
  selector: 'app-document-reads',
  template: `
    <span hidden>
      <output data-check="metadata">{{ metadata.status() }}</output>
      <output data-check="outline">{{ outline.status() }}</output>
      <output data-check="attachment">{{ attachment.status() }}</output>
      <output data-check="fonts">{{ fonts.status() }}</output>
    </span>
  `,
})
export class AppDocumentReads {
  protected readonly metadata = inject(EpdfMetadata);
  protected readonly outline = inject(EpdfOutline);
  protected readonly attachment = inject(EpdfAttachment);
  protected readonly fonts = inject(EpdfFonts);
}

const layout: LayoutFunction = (base) =>
  base.add(
    { custom: 'app-search', command: 'panel:search', importance: 5 },
    { to: 'main', section: 'start', group: 'app' },
  );

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer, EpdfToolbarItem, AppSearch, AppDocumentReads],
  template: `
    <epdf-pdf-viewer
      src="/sample.pdf"
      [layout]="layout"
      style="height: 100vh"
      (ready)="ready($event)"
    >
      <ng-template epdfToolbarItem="app-search"><app-search /><app-document-reads /></ng-template>
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
