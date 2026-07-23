/**
 * The example is now a thin CONSUMER of @embedpdf/viewer-chrome: it chooses an
 * engine (the one decision every host makes — ADAPTERS.md) and supplies demo
 * documents. Everything else — plugin set, toolbars, theme, translations — is
 * the chrome's.
 */
import { FullViewer } from '@embedpdf/viewer-chrome';
import { createEngine, initialDocuments } from './engine';

export function App() {
  // Thunk form: the Viewer constructs the engine on mount (cheap — it boots
  // lazily) and destroys it on unmount.
  return <FullViewer engine={createEngine} initialDocuments={initialDocuments} />;
}
