import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { actionsPlugin, useActionsUiAdapter } from '@embedpdf/react/actions';
import { LinkLayer, linkPlugin } from '@embedpdf/react/link';
import { cloudEngine } from '@cloudpdf/engine';

import './custom.css';

const engine = cloudEngine();
// The actions plugin runs a link that names a viewer command, such as the cover's "Next page".
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), actionsPlugin(), linkPlugin()];

const links: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The browser's way to open a website, once for the viewer.
function BrowserActions() {
  useActionsUiAdapter();
  return null;
}

export default function App() {
  const [shown, setShown] = useState(true);

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: links }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <BrowserActions />
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Link areas">
            <button type="button" aria-pressed={shown} onClick={() => setShown(true)}>
              Show link areas
            </button>
            <button type="button" aria-pressed={!shown} onClick={() => setShown(false)}>
              As the PDF has them
            </button>
          </div>
        </div>
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <LinkLayer
                renderLink={
                  ({ link, native }) =>
                    shown ? (
                      // Wrapping `native` keeps what a click does.
                      <span className="pdf-link" data-kind={link.target.kind}>
                        {native}
                      </span>
                    ) : undefined // the layer's own, invisible area
                }
              />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
