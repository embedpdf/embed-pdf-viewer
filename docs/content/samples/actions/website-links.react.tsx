import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import {
  actionsPlugin,
  useActions,
  useActionsUiAdapter,
  type ActionContext,
  type PdfActionTree,
} from '@embedpdf/react/actions';
import { localEngine } from '@embedpdf/engine';

import './website-links.css';

const engine = localEngine();
const plugins = [actionsPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A link to a website, as a PDF carries it: what getActionTree() reads from a link.
const websiteLink: PdfActionTree = {
  root: { type: 'uri', subtype: 'URI', uri: 'https://www.embedpdf.com', isMap: false, next: [] },
  incomplete: false,
  warningFlags: 0,
  warnings: [],
};
const click: ActionContext = {
  origin: 'user',
  source: { kind: 'api' },
  event: { scope: 'activate' },
};

// Your UI decides how a website opens: here, it asks first.
function AskBeforeOpening() {
  const actions = useActions();
  const [asking, setAsking] = useState<string | null>(null);

  useActionsUiAdapter({ openUri: (uri) => setAsking(uri) });

  // The link is clicked once on load, so the question is there to see.
  const clicked = useRef(false);
  useEffect(() => {
    if (clicked.current) return;
    clicked.current = true;
    void actions.execute(websiteLink, click);
  });

  return (
    <section className="panel">
      <p className="lead">
        The document links to <code>https://www.embedpdf.com</code>.
      </p>
      <button type="button" className="button" onClick={() => actions.execute(websiteLink, click)}>
        Click the link
      </button>
      {asking && (
        <div className="prompt" role="alertdialog" aria-label="Open a website">
          <p className="prompt-text">
            This document wants to open <strong>{asking}</strong>.
          </p>
          <div className="prompt-actions">
            <button type="button" className="button" onClick={() => setAsking(null)}>
              Stay here
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                window.open(asking, '_blank', 'noopener');
                setAsking(null);
              }}
            >
              Open in a new tab
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AskBeforeOpening />
      </DocumentGate>
    </Viewer>
  );
}
