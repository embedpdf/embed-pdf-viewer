/**
 * Headless composables inside the viewer: a search box of the app's own, in a toolbar item, that
 * uses `useSearch()` and `useSearchState()` from the app's own `@embedpdf/vue` against the
 * viewer's kernel (`HooksApp.vue`). `hooks.test.ts` drives it.
 */
import { SearchToken as ViewerSearchToken } from '@embedpdf/viewer-vue';
import type { Viewer } from '@embedpdf/viewer-vue';
import { SearchToken } from '@embedpdf/vue/search';
import { createApp } from 'vue';

import { checkRecord } from './check';
import HooksApp from './HooksApp.vue';

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

createApp(HooksApp, { record }).mount('#root');
