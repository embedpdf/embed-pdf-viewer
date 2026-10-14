// Consumer archetype: a Vue app on CloudPDF, the viewer's cloud door alone. The check builds it
// (`vite build`), then type-checks it against the packed declarations (`vue-tsc`).
import type { PDFViewerProps } from '@cloudpdf/viewer-vue';
import { createApp } from 'vue';

import App from './App.vue';

// Proves the packed props are the cloud's, not `any`: a URL is not a CloudPDF document.
// @ts-expect-error a URL is a document of @embedpdf/viewer-vue
export const urlDocument: PDFViewerProps = { src: '/report.pdf' };

createApp(App).mount('#app');
