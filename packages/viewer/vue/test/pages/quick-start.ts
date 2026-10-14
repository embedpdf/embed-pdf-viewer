/**
 * Quick start's steps 3 and 4 in <PDFViewer>: its config (your color, two features left out, and
 * a command of yours, `acme:send`, in the main bar's `end` section) and your own component in the
 * toolbar with `ToolbarItem`, after a control of the app's own (`QuickStartApp.vue`).
 * `quick-start.test.ts` drives it from the keyboard.
 */
import type { Viewer } from '@embedpdf/viewer-vue';
import { createApp } from 'vue';

import { checkRecord } from './check';
import QuickStartApp from './QuickStartApp.vue';

export interface QuickStartRecord {
  viewer: Viewer | null;
  /** The document each run of `acme:send` was for, in order. */
  readonly sent: (string | null)[];
}

const record = checkRecord<QuickStartRecord>({ viewer: null, sent: [] });

createApp(QuickStartApp, { record }).mount('#root');
