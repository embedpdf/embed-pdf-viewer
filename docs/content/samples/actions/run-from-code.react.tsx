import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  actionsPlugin,
  useActions,
  useActionsUiAdapter,
  type PdfNamedAction,
} from '@embedpdf/react/actions';
import { localEngine } from '@embedpdf/engine';

import './run-from-code.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), actionsPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const VERBS: ReadonlyArray<[PdfNamedAction, string]> = [
  ['FirstPage', '⇤ First'],
  ['PrevPage', '‹ Previous'],
  ['NextPage', 'Next ›'],
  ['LastPage', 'Last ⇥'],
  ['Print', 'Print'],
];

// The viewer actions a PDF's buttons name, run from your own buttons.
function NamedActions() {
  const actions = useActions();
  const { currentPageIndex, pageCount } = useStageState();
  const [ran, setRan] = useState<string | null>(null);

  // Print goes to your UI adapter. This one says so, instead of opening the browser's print dialog.
  useActionsUiAdapter({ print: () => setRan('Print: your print handler ran') });

  // On load, as if a "Last page" button in the PDF was clicked. Running it twice changes nothing.
  useEffect(() => {
    void actions.executeNamed('LastPage').then(({ status }) => setRan(`LastPage: ${status}`));
  }, [actions]);

  return (
    <div className="toolbar">
      {VERBS.map(([name, label]) => (
        <button
          type="button"
          className="button"
          key={name}
          disabled={!actions.canExecuteNamed(name)}
          onClick={async () => {
            const { status } = await actions.executeNamed(name);
            if (name !== 'Print') setRan(`${name}: ${status}`);
          }}
        >
          {label}
        </button>
      ))}
      <span className="spacer" />
      <output className="readout">
        Page {currentPageIndex + 1} of {pageCount}
        {ran && <span className="ran"> · {ran}</span>}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <NamedActions />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
