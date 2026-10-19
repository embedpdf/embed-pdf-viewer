/**
 * The live props: `src`, `theme`, `locale`, `disable` and `readOnly` change on a running viewer
 * without mounting a new one, an event calls the handler of the latest render, and a changed prop
 * of any other key is ignored with one warning in development (`LivePropsApp.vue`).
 * `live-props.test.ts` drives it.
 */
import type { DocumentSrc, ThemePreference, Viewer } from '@embedpdf/viewer-vue';
import { createApp } from 'vue';

import { checkRecord } from './check';
import LivePropsApp from './LivePropsApp.vue';

export interface LiveProps {
  src: DocumentSrc | null;
  theme: ThemePreference;
  locale: string;
  disable: string[];
  readOnly: boolean;
}

export interface LivePropsRecord {
  /** Every viewer `@ready` gave, in order: one, while nothing mounts again. */
  readonly viewers: Viewer[];
  /** The first viewer's kernel, kept by the test to tell a live change from a new mount. */
  firstKernel: unknown;
  /** What `@panel-resize` heard, as `<tag> <id> <width>`: the tag of the render it came from. */
  readonly resized: string[];
  set(next: Partial<LiveProps>): void;
  /** Render again with a `@panel-resize` handler that says `tag`. */
  setTag(tag: string): void;
  rerender(): void;
}

const record = checkRecord<LivePropsRecord>({
  viewers: [],
  firstKernel: null,
  resized: [],
  set: () => {},
  setTag: () => {},
  rerender: () => {},
});

createApp(LivePropsApp, { record }).mount('#root');
