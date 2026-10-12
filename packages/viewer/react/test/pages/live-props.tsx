/**
 * The live props: `src`, `theme`, `locale`, `disable` and `readOnly` change on a running viewer
 * without mounting a new one, a callback prop calls its latest function, and a changed prop of any
 * other key is ignored with one warning in development. `live-props.test.ts` drives it.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PDFViewer } from '@embedpdf/viewer-react';
import type { DocumentSrc, ThemePreference, Viewer } from '@embedpdf/viewer-react';

import { checkRecord } from './check';

export interface LiveProps {
  src: DocumentSrc | null;
  theme: ThemePreference;
  locale: string;
  disable: string[];
  readOnly: boolean;
}

export interface LivePropsRecord {
  /** Every viewer `onReady` gave, in order: one, while nothing mounts again. */
  readonly viewers: Viewer[];
  /** The first viewer's kernel, kept by the test to tell a live change from a new mount. */
  firstKernel: unknown;
  /** What `onPanelResize` heard, as `<tag> <id> <width>`: the tag of the render it came from. */
  readonly resized: string[];
  set(next: Partial<LiveProps>): void;
  /** Render again with an `onPanelResize` that says `tag`. */
  setTag(tag: string): void;
  rerender(): void;
}

const record = checkRecord<LivePropsRecord>({
  viewers: [],
  firstKernel: null,
  resized: [],
  set: () => {},
  setTag: () => {},
  rerender: () => {},
});

function App() {
  const [props, setProps] = useState<LiveProps>({
    src: '/sample.pdf',
    theme: 'light',
    locale: 'en',
    disable: [],
    readOnly: false,
  });
  const [, setRenders] = useState(0);
  const [tag, setTag] = useState('first');
  record.set = (next) => setProps((current) => ({ ...current, ...next }));
  record.setTag = setTag;
  record.rerender = () => setRenders((renders) => renders + 1);
  return (
    <PDFViewer
      {...props}
      // A new array on every render: read once, so its change is ignored, with a warning.
      commands={[{ id: 'acme:hello', label: 'Hello', run: () => {} }]}
      style={{ height: '100vh', display: 'block' }}
      onReady={(viewer) => record.viewers.push(viewer)}
      // A new function on every render: the viewer calls the latest one.
      onPanelResize={({ id, width }) => record.resized.push(`${tag} ${id} ${width}`)}
    />
  );
}

createRoot(document.getElementById('root')!).render(<App />);
