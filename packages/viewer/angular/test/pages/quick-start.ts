/**
 * Quick start's steps 3 and 4 in `<epdf-pdf-viewer>`: its config (your color, two features left
 * out, and a command of yours, `acme:send`, in the main bar's `end` section) and your own
 * component in the toolbar with `epdfToolbarItem`, after a control of the app's own.
 * `quick-start.test.ts` drives it from the keyboard.
 */
import { boot } from './boot';

import { Component } from '@angular/core';
import { EpdfPdfViewer, EpdfToolbarItem } from '@embedpdf/viewer-angular';
import type { Layout, Viewer, ViewerConfig } from '@embedpdf/viewer-angular';

import { checkRecord } from './check';

export interface QuickStartRecord {
  viewer: Viewer | null;
  /** The document each run of `acme:send` was for, in order. */
  readonly sent: (string | null)[];
}

const record = checkRecord<QuickStartRecord>({ viewer: null, sent: [] });

/** Quick start's `viewer-config.js`, its command saying it ran in place of the request. */
const config = {
  theme: { accent: '#7c3aed' },
  disable: ['forms', 'redaction'],
  icons: {
    send: ['M10 14L21 3', 'M21 3l-6.5 18a.5.5 0 0 1-1 0L10 14l-7-3.5a.5.5 0 0 1 0-1L21 3z'],
  },
  commands: [
    {
      id: 'acme:send',
      label: 'Send for signature',
      icon: 'send',
      run: ({ documentId }) => {
        record.sent.push(documentId);
      },
    },
  ],
  layout: (layout: Layout) => layout.add('acme:send', { to: 'main', section: 'end' }),
} satisfies ViewerConfig;

/** Your own component: the document's status, with two controls of its own. */
@Component({
  selector: 'app-document-status',
  template: `
    <span class="status">
      Draft <button data-check="approve">Approve</button>
      <button data-check="reject">Reject</button>
    </span>
  `,
})
export class DocumentStatus {}

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer, EpdfToolbarItem, DocumentStatus],
  template: `
    <button data-check="before">Before the viewer</button>
    <epdf-pdf-viewer
      src="/sample.pdf"
      [config]="config"
      [layout]="layout"
      style="height: 100vh"
      (ready)="ready($event)"
    >
      <ng-template epdfToolbarItem="status"><app-document-status /></ng-template>
    </epdf-pdf-viewer>
  `,
})
export class App {
  protected readonly config = config;
  /** Step 4: room for your component, after the config's own layout. */
  protected readonly layout = (base: Layout) =>
    config.layout(base).add({ custom: 'status' }, { to: 'main', section: 'end' });

  protected ready(viewer: Viewer): void {
    record.viewer = viewer;
  }
}

boot(App);
