import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { fontsPlugin, useFontCss, useFontsState } from '@embedpdf/react/fonts';
import { localEngine } from '@embedpdf/engine';

import './draw.css';

const engine = localEngine();
const plugins = [fontsPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Type in any font the document can be written in, drawn as the engine will write it.
function FontPreview() {
  const { fonts } = useFontsState();
  const [font, setFont] = useState('times-roman');
  // The font's CSS, its programs mounted while this component lives.
  const css = useFontCss(font);
  const choosable = fonts?.fonts.filter((entry) => entry.canChoose) ?? [];

  return (
    <section className="panel">
      <label className="field">
        Font
        <select value={font} onChange={(event) => setFont(event.target.value)}>
          {choosable.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      <textarea
        className="preview"
        defaultValue={'Hello שלום مرحبا 你好'}
        style={{
          fontFamily: css?.fontFamily,
          fontWeight: css?.fontWeight,
          fontStyle: css?.fontStyle,
          fontSynthesis: 'none',
        }}
      />
      <p className="hint">Characters no font has show as boxes, as the engine writes them.</p>
    </section>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <FontPreview />
      </DocumentGate>
    </Viewer>
  );
}
