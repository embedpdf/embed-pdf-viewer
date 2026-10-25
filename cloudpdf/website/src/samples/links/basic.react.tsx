import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { actionsPlugin, useActionsUiAdapter } from '@embedpdf/react/actions';
import { LinkLayer, linkPlugin } from '@embedpdf/react/link';
import { cloudEngine } from '@cloudpdf/engine';

import './basic.css';

const engine = cloudEngine();
// The actions plugin runs a link that names a viewer command, such as the footer's Next.
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), actionsPlugin(), linkPlugin()];

const links: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The browser's way to open a website, once for the viewer.
function BrowserActions() {
  useActionsUiAdapter();
  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: links }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <BrowserActions />
        <p className="hint">
          Every blue label is a link. Click one, or press Tab to reach it and Enter to follow it.
        </p>
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <LinkLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
