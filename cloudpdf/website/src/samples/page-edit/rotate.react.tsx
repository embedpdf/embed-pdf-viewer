import { useEffect } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { pageEditPlugin, usePageEdit } from '@embedpdf/react/page-edit';
import { cloudEngine } from '@cloudpdf/engine';

import './rotate.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), pageEditPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Rotates the page you're on, in the file: the turn is kept when the document is downloaded.
function RotateToolbar() {
  const pageEdit = usePageEdit();
  const pages = usePageList();
  const currentPageIndex = useStageState((state) => state.currentPageIndex);
  const page = pages[currentPageIndex];

  // The first page starts a quarter turn clockwise. setRotation() sets the same rotation
  // however often it runs; rotateBy() would turn it again.
  useEffect(() => {
    void pageEdit.setRotation([0], 90);
  }, [pageEdit]);

  if (!page) return null;
  const canEdit = pageEdit.canEdit();
  return (
    <div className="toolbar">
      <output className="readout">
        Page {currentPageIndex + 1} · {page.rotation}°
      </output>
      <span className="spacer" />
      <button
        type="button"
        className="button"
        disabled={!canEdit}
        onClick={() => pageEdit.rotateBy([page.ref], -90)}
      >
        ⟲ Rotate left
      </button>
      <button
        type="button"
        className="button"
        disabled={!canEdit}
        onClick={() => pageEdit.rotateBy([page.ref], 90)}
      >
        ⟳ Rotate right
      </button>
      <button
        type="button"
        className="button"
        disabled={!canEdit}
        onClick={() =>
          pageEdit.setRotation(
            pages.map((each) => each.ref),
            0,
          )
        }
      >
        Every page upright
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <RotateToolbar />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
