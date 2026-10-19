/**
 * Your own components in <PDFViewer>: `ToolbarItem`, `Panel` and `Region` put them in the
 * viewer, `useToolbarItem()` says where an item sits (and follows the bar to a rail when the
 * viewer narrows), and `Button`, `Menu` and `MenuItem` are the viewer's own (`Components.svelte`).
 * `components.test.ts` drives it.
 */
import type { Viewer } from '@embedpdf/viewer-svelte';
import { mount } from 'svelte';

import { checkRecord } from './check';
import Components from './Components.svelte';

export interface ComponentsRecord {
  viewer: Viewer | null;
  /** What each `MenuItem` picked said, in order. */
  readonly picked: string[];
  setWidth(width: string): void;
}

const record = checkRecord<ComponentsRecord>({ viewer: null, picked: [], setWidth: () => {} });

mount(Components, { target: document.getElementById('root')!, props: { record } });
