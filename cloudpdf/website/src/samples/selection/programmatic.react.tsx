import { Viewer, DocumentGate, useSelector } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  SelectionLayer,
  SelectionToken,
  selectionPlugin,
  useSelection,
} from '@embedpdf/react/selection';
import { cloudEngine } from '@cloudpdf/engine';

import {
  Badge,
  Button,
  Demo,
  Spacer,
  StageFrame,
  Toolbar,
  stageFill,
} from '../stage/_shared/chrome';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin({ interaction: true }),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function SelectionToolbar() {
  const stage = useStage();
  const selection = useSelection();
  const hasSelection = useSelector(SelectionToken, (value) => value.hasSelection());

  const selectCurrentPage = () => {
    const page = stage.pages()[stage.currentPage()];
    if (page) selection.select({ pon: page.pon, start: 0, count: 120 });
  };

  return (
    <Toolbar>
      <Button onClick={selectCurrentPage} disabled={!selection.canSelect()}>
        Select first 120 characters
      </Button>
      <Button onClick={() => selection.selectAll()} disabled={!selection.canSelect()}>
        Select all
      </Button>
      <Button onClick={() => selection.clear()} disabled={!hasSelection}>
        Clear
      </Button>
      <Spacer />
      <Badge>{hasSelection ? 'Selection active' : 'Nothing selected'}</Badge>
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <SelectionToolbar />
          <StageFrame height={420}>
            <Stage interaction style={stageFill}>
              {() => (
                <>
                  <RenderLayer />
                  <SelectionLayer />
                </>
              )}
            </Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
