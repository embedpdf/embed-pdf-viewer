import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import {
  actionsPlugin,
  useActions,
  useActionsEvent,
  useActionsUiAdapter,
  type ActionContext,
  type PdfActionTree,
} from '@embedpdf/react/actions';
import { localEngine } from '@embedpdf/engine';

import './javascript.css';

const engine = localEngine();
// JavaScript on, and two fields scripts often ask for about the user.
const plugins = [
  actionsPlugin({
    javascript: { enabled: true, identity: { name: 'Dana Smith', corporation: 'Acme' } },
  }),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A JavaScript action, as a PDF carries it behind a button or a link.
const script = (code: string): PdfActionTree => ({
  root: { type: 'javascript', subtype: 'JavaScript', script: code, next: [] },
  incomplete: false,
  warningFlags: 0,
  warnings: [],
});
const click: ActionContext = {
  origin: 'user',
  source: { kind: 'api' },
  event: { scope: 'activate' },
};

const GREETING = "app.alert('Hello, ' + identity.name + ' from ' + identity.corporation + '!');";

// Edit the script and run it. Its alerts and its errors show below it.
function ScriptConsole() {
  const actions = useActions();
  const [code, setCode] = useState(GREETING);
  const [output, setOutput] = useState<Array<{ kind: 'alert' | 'error'; text: string }>>([]);
  const show = (kind: 'alert' | 'error', text: string) =>
    setOutput((lines) => [{ kind, text }, ...lines].slice(0, 5));

  // A script's alert goes to your UI adapter: here, a line below the script.
  useActionsUiAdapter({ alert: (message) => show('alert', message) });
  useActionsEvent(
    (capability) => capability.onScriptFailed,
    ({ error }) => show('error', error.message),
  );

  // The greeting runs once on load.
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    void actions.execute(script(GREETING), click);
  });

  return (
    <section className="panel">
      <label className="name" htmlFor="script">
        Script {actions.isScriptingEnabled() ? '' : '(JavaScript is off)'}
      </label>
      <textarea
        id="script"
        className="code"
        spellCheck={false}
        rows={3}
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <div className="actions">
        <button
          type="button"
          className="button primary"
          onClick={() => actions.execute(script(code), click)}
        >
          Run
        </button>
        <button type="button" className="button" onClick={() => setCode('app.alrt("typo");')}>
          A script with a mistake
        </button>
      </div>
      <ol className="output" aria-live="polite">
        {output.map((line, index) => (
          <li key={output.length - index} className={line.kind}>
            {line.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ScriptConsole />
      </DocumentGate>
    </Viewer>
  );
}
