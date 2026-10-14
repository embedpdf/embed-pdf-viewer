/**
 * The live inputs: `src`, `theme`, `locale`, `disable` and `readOnly` change on a running viewer
 * without mounting a new one, `(panelResize)` runs the handler as the template has it now, and a
 * changed input of any other key is ignored with one warning in development.
 * `live-props.test.ts` drives it.
 */
import { boot } from './boot';

import { Component, signal } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';
import type {
  CommandDef,
  DocumentSrc,
  PanelResizeEvent,
  ThemePreference,
  Viewer,
} from '@embedpdf/viewer-angular';

import { checkRecord } from './check';

export interface LiveProps {
  src: DocumentSrc | null;
  theme: ThemePreference;
  locale: string;
  disable: string[];
  readOnly: boolean;
}

export interface LivePropsRecord {
  /** Every viewer `(ready)` gave, in order: one, while nothing mounts again. */
  readonly viewers: Viewer[];
  /** The first viewer's kernel, kept by the test to tell a live change from a new mount. */
  firstKernel: unknown;
  /** What `(panelResize)` heard, as `<tag> <id> <width>`: the tag the template had then. */
  readonly resized: string[];
  set(next: Partial<LiveProps>): void;
  /** Give `(panelResize)` another tag to say. */
  setTag(tag: string): void;
  /** Give `[commands]` a new array: a key read once. */
  newCommands(): void;
}

const record = checkRecord<LivePropsRecord>({
  viewers: [],
  firstKernel: null,
  resized: [],
  set: () => {},
  setTag: () => {},
  newCommands: () => {},
});

const hello = (): CommandDef[] => [{ id: 'acme:hello', label: 'Hello', run: () => {} }];

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `
    <epdf-pdf-viewer
      [src]="props().src"
      [theme]="props().theme"
      [locale]="props().locale"
      [disable]="props().disable"
      [readOnly]="props().readOnly"
      [commands]="commands()"
      style="height: 100vh"
      (ready)="ready($event)"
      (panelResize)="resized($event)"
    />
  `,
})
export class App {
  protected readonly props = signal<LiveProps>({
    src: '/sample.pdf',
    theme: 'light',
    locale: 'en',
    disable: [],
    readOnly: false,
  });
  protected readonly commands = signal(hello());
  private readonly tag = signal('first');

  constructor() {
    record.set = (next) => this.props.update((current) => ({ ...current, ...next }));
    record.setTag = (tag) => this.tag.set(tag);
    record.newCommands = () => this.commands.set(hello());
  }

  protected ready(viewer: Viewer): void {
    record.viewers.push(viewer);
  }

  protected resized({ id, width }: PanelResizeEvent): void {
    record.resized.push(`${this.tag()} ${id} ${width}`);
  }
}

boot(App);
