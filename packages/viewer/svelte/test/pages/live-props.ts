/**
 * The live props: `src`, `theme`, `locale`, `disable` and `readOnly` change on a running viewer
 * without mounting a new one, a callback prop calls its latest function, and a changed prop of any
 * other key is ignored with one warning in development (`LiveProps.svelte`).
 * `live-props.test.ts` drives it.
 */
import { EmbedPdfViewerElement } from '@embedpdf/viewer-svelte';
import type { DocumentSrc, ThemePreference, Viewer } from '@embedpdf/viewer-svelte';
import { mount } from 'svelte';

import { checkRecord } from './check';
import LiveProps from './LiveProps.svelte';

/** The live keys, as the page sets them. */
export interface LiveConfig {
  src: DocumentSrc | null;
  theme: ThemePreference;
  locale: string;
  disable: string[];
  readOnly: boolean;
}

export interface LivePropsRecord {
  /** How many viewers the element mounted: it asks its door for the default engine for each. */
  mounted: number;
  /** Every viewer `onready` gave, in order: one, while nothing mounts again. */
  readonly viewers: Viewer[];
  /** The first viewer's kernel, kept by the test to tell a live change from a new mount. */
  firstKernel: unknown;
  /** What `onpanelresize` heard, as `<tag> <id> <width>`: the tag of the function it came from. */
  readonly resized: string[];
  set(next: Partial<LiveConfig>): void;
  /** Give the viewer an `onpanelresize` that says `tag`. */
  setTag(tag: string): void;
  /** Give the viewer a new `commands`, a key it reads once. */
  rerender(): void;
}

const record = checkRecord<LivePropsRecord>({
  mounted: 0,
  viewers: [],
  firstKernel: null,
  resized: [],
  set: () => {},
  setTag: () => {},
  rerender: () => {},
});

// The element mounts its viewer a microtask after it's on the page: with the config there by
// then, it mounts one, and never a first one without it.
const provide = EmbedPdfViewerElement.defaultEngineProvider!;
EmbedPdfViewerElement.defaultEngineProvider = (option) => {
  record.mounted += 1;
  return provide(option);
};

mount(LiveProps, { target: document.getElementById('root')!, props: { record } });
