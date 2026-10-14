import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput, PageRef } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { pageEditPlugin, usePageEdit } from '@embedpdf/react/page-edit';
import { localEngine } from '@embedpdf/engine';

import './insert.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), pageEditPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

/** Another PDF's bytes, to insert pages from. */
const otherPdf = async () => (await fetch('https://snippet.embedpdf.com/ebook.pdf')).arrayBuffer();

// Inserts next to the page you're on, then goes to the first new page.
function InsertToolbar() {
  const pageEdit = usePageEdit();
  const stage = useStage();
  const pages = usePageList();
  const currentPageIndex = useStageState((state) => state.currentPageIndex);
  const page = pages[currentPageIndex];
  const [added, setAdded] = useState<readonly PageRef[]>([]);

  // Every insert resolves { pages }: the new pages, to go to or select.
  const show = (result: { pages: readonly PageRef[] }) => {
    setAdded(result.pages);
    stage.goToPage(result.pages[0]);
  };

  // A blank page after the cover, once, on load.
  const inserted = useRef(false);
  useEffect(() => {
    if (inserted.current || !pages[0]) return;
    inserted.current = true;
    void pageEdit.insertBlank({ placement: { after: pages[0].ref } }).then(show);
  });

  if (!page) return null;
  const canEdit = pageEdit.canEdit();
  const positions = added
    .map((ref) => pages.findIndex((each) => each.ref.objectNumber === ref.objectNumber) + 1)
    .filter((position) => position > 0);

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!canEdit}
        onClick={() => pageEdit.insertBlank({ placement: { after: page.ref } }).then(show)}
      >
        + Blank page after
      </button>
      <button
        type="button"
        className="button"
        disabled={!canEdit || !pageEdit.canExtract()}
        onClick={() => pageEdit.duplicate([page.ref]).then(show)}
      >
        Duplicate page
      </button>
      <button
        type="button"
        className="button"
        disabled={!canEdit}
        onClick={async () =>
          show(
            await pageEdit.insertFromBytes(await otherPdf(), {
              pageIndexes: [0, 2],
              placement: { after: page.ref },
            }),
          )
        }
      >
        + Pages 1 and 3 of another PDF
      </button>
      <span className="spacer" />
      <output className="readout">
        {positions.length > 0
          ? `New: page ${positions.join(' and ')} of ${pages.length}`
          : `${pages.length} pages`}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <InsertToolbar />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
