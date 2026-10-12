/**
 * Your own components in <PDFViewer>: `ToolbarItem`, `Panel` and `Region` put them in the
 * viewer, `useToolbarItem()` says where an item sits (and follows the bar to a rail when the
 * viewer narrows), and `Button`, `Menu` and `MenuItem` are the viewer's own
 * (`ComponentsApp.vue`). `components.test.ts` drives it.
 */
import type { Viewer } from '@embedpdf/viewer-vue';
import { createApp } from 'vue';

import { checkRecord } from './check';
import ComponentsApp from './ComponentsApp.vue';

export interface ComponentsRecord {
  viewer: Viewer | null;
  /** What each `MenuItem` picked said, in order. */
  readonly picked: string[];
  setWidth(width: string): void;
}

const record = checkRecord<ComponentsRecord>({ viewer: null, picked: [], setWidth: () => {} });

createApp(ComponentsApp, { record }).mount('#root');
