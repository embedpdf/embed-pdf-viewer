/**
 * Quick start's steps 3 and 4 in <PDFViewer>: its config (your color, two features left out, and
 * a command of yours, `acme:send`, in the main bar's `end` section) and your own component in the
 * toolbar with `ToolbarItem`, after a control of the app's own (`QuickStart.svelte`).
 * `quick-start.test.ts` drives it from the keyboard.
 */
import type { Viewer } from '@embedpdf/viewer-svelte';
import { mount } from 'svelte';

import { checkRecord } from './check';
import QuickStart from './QuickStart.svelte';

export interface QuickStartRecord {
  viewer: Viewer | null;
  /** The document each run of `acme:send` was for, in order. */
  readonly sent: (string | null)[];
}

const record = checkRecord<QuickStartRecord>({ viewer: null, sent: [] });

mount(QuickStart, { target: document.getElementById('root')!, props: { record } });
