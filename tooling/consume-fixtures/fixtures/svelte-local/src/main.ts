// Consumer archetype: a Svelte app on the viewer's built-in engine, as Quick start writes it. The
// check builds it (`vite build`), then type-checks it against the packed declarations
// (`svelte-check`).
import type { PDFViewerProps } from '@embedpdf/viewer-svelte';
import { mount } from 'svelte';

import App from './App.svelte';

// Proves the packed props are this door's, not `any`: a CloudPDF document is not one of its documents.
// @ts-expect-error `{ token }` is a document of @cloudpdf/viewer-svelte
export const cloudDocument: PDFViewerProps = { src: { token: 'fixture-token' } };

mount(App, { target: document.getElementById('app')! });
