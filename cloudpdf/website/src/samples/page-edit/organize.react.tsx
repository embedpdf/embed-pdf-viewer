import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, usePages, usePageList } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { pageEditPlugin, usePageEditor } from '@embedpdf/react/page-edit';
import { cloudEngine } from '@cloudpdf/engine';

import './organize.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), pageEditPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function OrganizeToolbar() {
  const editor = usePageEditor();
  const { currentPage, pageCount } = usePages();
  const { pages } = usePageList();
  const page = pages[currentPage];
  const canEdit = editor.canEdit();
  if (!page) return null;
  return (
    <div className="toolbar">
      <output className="readout">
        page {currentPage + 1} / {pageCount}
      </output>
      <span className="spacer" />
      <button
        type="button"
        className="button"
        title="Rotate this page 90° clockwise — written into the document, kept on save"
        disabled={!canEdit}
        onClick={() => editor.rotateBy([page.ref], 90)}
      >
        ⟳ Rotate page
      </button>
      <button
        type="button"
        className="button"
        title="Add a blank page after this one, sized to match it"
        disabled={!canEdit}
        onClick={() => editor.insertBlank({ placement: { after: page.ref } })}
      >
        + Blank page
      </button>
      <button
        type="button"
        className="button"
        title="Delete this page"
        disabled={!canEdit || pageCount < 2}
        onClick={() => editor.delete([page.ref])}
      >
        Delete page
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <OrganizeToolbar />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
