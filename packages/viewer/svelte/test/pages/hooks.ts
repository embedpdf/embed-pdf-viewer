/**
 * Headless functions inside the viewer: a search box of the app's own, in a toolbar item, that
 * uses `useSearch()` and `useSearchState()` from the app's own `@embedpdf/svelte` against the
 * viewer's kernel (`Hooks.svelte`). `hooks.test.ts` drives it.
 */
import { SearchToken } from '@embedpdf/svelte/search';
import { SearchToken as ViewerSearchToken } from '@embedpdf/viewer-svelte';
import type { Viewer } from '@embedpdf/viewer-svelte';
import { mount } from 'svelte';

import { checkRecord } from './check';
import Hooks from './Hooks.svelte';

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

mount(Hooks, { target: document.getElementById('root')!, props: { record } });
