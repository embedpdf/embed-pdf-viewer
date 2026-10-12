/**
 * The wrapper's live props: `src`, `theme`, `locale`, `disable` and `readOnly` change on a
 * running viewer without mounting a new one, and a changed prop of any other key is ignored
 * with one warning in development. `test/live-props.mjs` drives it through `window.live`.
 *
 * Built by `vite.spike.config.ts` (`SPIKE_ENTRY=live-props`).
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PDFViewer } from '@embedpdf/viewer-react';
import type { DocumentSrc, ThemePreference, Viewer } from '@embedpdf/viewer-react';
import './index.css';

interface LiveProps {
  src: DocumentSrc | null;
  theme: ThemePreference;
  locale: string;
  disable: string[];
  readOnly: boolean;
}

declare global {
  interface Window {
    live?: {
      set(next: Partial<LiveProps>): void;
      rerender(): void;
      readonly viewers: Viewer[];
    };
  }
}

const viewers: Viewer[] = [];

function App() {
  const [props, setProps] = useState<LiveProps>({
    src: '/testlab.pdf',
    theme: 'light',
    locale: 'en',
    disable: [],
    readOnly: false,
  });
  const [, setRenders] = useState(0);
  window.live = {
    set: (next) => setProps((current) => ({ ...current, ...next })),
    rerender: () => setRenders((renders) => renders + 1),
    viewers,
  };
  return (
    <PDFViewer
      {...props}
      // A new array on every render: read once, so its change is ignored, with a warning.
      commands={[{ id: 'acme:hello', label: 'Hello', run: () => {} }]}
      style={{ height: '100vh', display: 'block' }}
      onReady={(viewer) => viewers.push(viewer)}
    />
  );
}

createRoot(document.getElementById('root')!).render(<App />);
