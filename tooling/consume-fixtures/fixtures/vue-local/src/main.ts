// Consumer archetype: a Vue app on the viewer's built-in engine, as Quick start writes it. The
// check builds it (`vite build`), then type-checks it against the packed declarations (`vue-tsc`).
import type { PDFViewerProps } from '@embedpdf/viewer-vue';
import { createApp } from 'vue';

import App from './App.vue';

// Proves the packed props are this door's, not `any`: a CloudPDF document is not one of its documents.
// @ts-expect-error `{ token }` is a document of @cloudpdf/viewer-vue
export const cloudDocument: PDFViewerProps = { src: { token: 'fixture-token' } };

createApp(App).mount('#app');
