import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, usePages, usePageList } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { pageEditPlugin, usePageEditor } from '@embedpdf/react/page-edit';
import { localEngine } from '@embedpdf/engine';

import {
  Demo,
  Toolbar,
  Button,
  Readout,
  Spacer,
  StageFrame,
  stageFill,
} from '../stage/_shared/chrome';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), pageEditPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function OrganizeToolbar() {
  const editor = usePageEditor();
  const { currentPage, pageCount } = usePages();
  const { pages } = usePageList();
  const page = pages[currentPage];
  const canEdit = editor.canEdit();
  if (!page) return null;
  return (
    <Toolbar>
      <Readout>
        page {currentPage + 1} / {pageCount}
      </Readout>
      <Spacer />
      <Button
        title="Rotate this page 90° clockwise — written into the document, kept on save"
        disabled={!canEdit}
        onClick={() => editor.rotateBy(page.pon, 90)}
      >
        ⟳ Rotate page
      </Button>
      <Button
        title="Add a blank page after this one, sized to match it"
        disabled={!canEdit}
        onClick={() => editor.addBlank({ placement: { after: page.pon } })}
      >
        + Blank page
      </Button>
      <Button
        title="Delete this page"
        disabled={!canEdit || pageCount < 2}
        onClick={() => editor.delete([page.pon])}
      >
        Delete page
      </Button>
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <OrganizeToolbar />
          <StageFrame height={420}>
            <Stage style={stageFill}>{() => <RenderLayer />}</Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
