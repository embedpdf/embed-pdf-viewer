/**
 * The viewer in code, from Angular: `inject(EpdfPdfViewerRef)` and `commandOf()` in a component
 * inside `<epdf-pdf-viewer>`, a headless service next to them, `(ready)` and the element outside
 * it, the `plugins` config with a plugin of the app's own, and the viewer being done once
 * `<epdf-pdf-viewer>` goes. `viewer-code.test.ts` drives it.
 */
import { boot } from './boot';

import { Component, inject, signal, type Signal } from '@angular/core';
import { EpdfInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfCommands,
  EpdfPdfViewer,
  EpdfPdfViewerRef,
  EpdfRegion,
} from '@embedpdf/viewer-angular';
import type { BoundCommand } from '@embedpdf/angular/commands';
import type { EmbedPdfViewerElement, Viewer } from '@embedpdf/viewer-angular';

import { checkRecord } from './check';

/** What a component inside the viewer reads, when the test asks. */
export interface Inside {
  viewer(): Viewer | null;
  zoomIn(): BoundCommand;
  pan(): BoundCommand;
  missing(): BoundCommand;
  /** The active tool, from the headless `EpdfInteraction`. */
  activeTool(): string | null;
  /** How many times a component inside has been made: once per viewer. */
  mounts: number;
}

export interface ViewerCodeRecord {
  /** Every viewer `(ready)` gave, in order. */
  readonly viewers: Viewer[];
  /** The element each `(ready)` came with, from the component's `element()`. */
  readonly elements: EmbedPdfViewerElement[];
  /** What each viewer's `documents.onClosed` heard, as `<viewer index> closed <id>`. */
  readonly heard: string[];
  /** What the app's own analytics plugin tracked. */
  readonly tracked: string[];
  inside: Inside | null;
  /** What `inject(EpdfPdfViewerRef)` did outside `<epdf-pdf-viewer>`: its error's message. */
  outside: string | null;
  show(shown: boolean): void;
}

const record = checkRecord<ViewerCodeRecord>({
  viewers: [],
  elements: [],
  heard: [],
  tracked: [],
  inside: null,
  outside: null,
  show: () => {},
});
let mounts = 0;

/** A plugin of the app's own, as a headless app writes one. */
const analyticsPlugin = (config: { endpoint: string }) => ({
  id: 'acme-analytics',
  token: { name: 'analytics' },
  create: () => ({
    api: { track: (name: string) => record.tracked.push(`${config.endpoint} ${name}`) },
  }),
});

const PLUGINS = {
  stage: { spread: 'odd' as const },
  analytics: analyticsPlugin({ endpoint: '/api/events' }),
};

@Component({ selector: 'app-inside', template: '' })
export class Inside {
  constructor() {
    const ref = inject(EpdfPdfViewerRef);
    const commands = inject(EpdfCommands);
    const interaction = inject(EpdfInteraction);
    const read =
      <T>(value: Signal<T>) =>
      () =>
        value();
    record.inside = {
      viewer: read(ref.viewer),
      zoomIn: read(commands.commandOf('zoom:in')),
      pan: read(commands.commandOf('tool:pan')),
      missing: read(commands.commandOf('acme:missing')),
      activeTool: read(interaction.activeToolId),
      mounts: ++mounts,
    };
  }
}

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer, EpdfRegion, Inside],
  template: `
    @if (shown()) {
      <epdf-pdf-viewer
        #pdf
        src="/sample.pdf"
        [plugins]="plugins"
        class="report-viewer"
        style="height: 100vh"
        (ready)="ready($event, pdf.element())"
      >
        <ng-template epdfRegion="footer"><app-inside /></ng-template>
      </epdf-pdf-viewer>
    }
  `,
})
export class App {
  protected readonly plugins = PLUGINS;
  protected readonly shown = signal(true);

  constructor() {
    try {
      inject(EpdfPdfViewerRef);
      record.outside = 'no error';
    } catch (error) {
      record.outside = (error as Error).message;
    }
    record.show = (shown) => this.shown.set(shown);
  }

  protected ready(viewer: Viewer, element: EmbedPdfViewerElement): void {
    const index = record.viewers.push(viewer) - 1;
    record.elements.push(element);
    viewer.documents.onClosed(({ documentId }) =>
      record.heard.push(`${index} closed ${documentId}`),
    );
  }
}

boot(App);
