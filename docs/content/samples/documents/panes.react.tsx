import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, DocumentScope, useDocumentsState } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  useViewManager,
  useViewManagerState,
  viewManagerPlugin,
  type PaneInfo,
} from '@embedpdf/react/view-manager';
import { localEngine } from '@embedpdf/engine';

import './panes.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), viewManagerPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function Pane({ pane, canRemove }: { pane: PaneInfo; canRemove: boolean }) {
  const views = useViewManager();
  const focusedPaneId = useViewManagerState((state) => state.focusedPaneId);
  const { documents } = useDocumentsState();
  const nameOf = (id: string) => documents.find((document) => document.id === id)?.name ?? id;

  return (
    <section
      className="pane"
      data-focused={pane.id === focusedPaneId}
      onPointerDown={() => views.setFocusedPane(pane.id)}
    >
      <div className="bar" role="tablist">
        {pane.documentIds.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={id === pane.activeDocumentId}
            onClick={() => views.setActiveDocument(pane.id, id)}
          >
            {nameOf(id)}
          </button>
        ))}
        <button
          type="button"
          className="button"
          disabled={!pane.activeDocumentId || pane.documentIds.length < 2}
          onClick={() => views.splitPane(pane.activeDocumentId!, { from: pane.id })}
        >
          Split
        </button>
        <button
          type="button"
          className="button"
          disabled={!canRemove}
          onClick={() => views.removePane(pane.id)}
        >
          Close pane
        </button>
      </div>
      {pane.activeDocumentId ? (
        <DocumentScope id={pane.activeDocumentId}>
          <DocumentGate fallback={<p className="empty">Opening…</p>}>
            <Stage className="stage">{() => <RenderLayer />}</Stage>
          </DocumentGate>
        </DocumentScope>
      ) : (
        <p className="empty">No document in this pane.</p>
      )}
    </section>
  );
}

function Panes() {
  const views = useViewManager();
  const { panes } = useViewManagerState();

  // On load, both documents land in the first pane: put the second one beside it, once.
  const splitOnLoad = useRef(true);
  useEffect(() => {
    if (splitOnLoad.current && panes.length === 1 && panes[0].documentIds.length === 2) {
      splitOnLoad.current = false;
      views.splitPane(panes[0].documentIds[1]);
    }
  }, [panes, views]);

  return (
    <div className="panes">
      {panes.map((pane) => (
        <Pane key={pane.id} pane={pane} canRemove={panes.length > 1} />
      ))}
    </div>
  );
}

export default function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[
        { source: ebook, name: 'Contract' },
        { source: ebook, name: 'Report' },
      ]}
    >
      <Panes />
    </Viewer>
  );
}
