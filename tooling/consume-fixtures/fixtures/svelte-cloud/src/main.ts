// Consumer archetype: a Svelte app on CloudPDF, the viewer's cloud door alone. The check builds
// it (`vite build`), then type-checks it against the packed declarations (`svelte-check`).
import type { PDFViewerProps } from '@cloudpdf/viewer-svelte';
import { mount } from 'svelte';

import App from './App.svelte';

// Proves the packed props are the cloud's, not `any`: a URL is not a CloudPDF document.
// @ts-expect-error a URL is a document of @embedpdf/viewer-svelte
export const urlDocument: PDFViewerProps = { src: '/report.pdf' };

mount(App, { target: document.getElementById('app')! });
