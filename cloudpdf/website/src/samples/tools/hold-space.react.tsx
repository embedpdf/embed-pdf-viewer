import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { cloudEngine } from '@cloudpdf/engine';

import './hold-space.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// While Space is held over the pages, the hand tool is active; on release, the tool from before.
function HoldSpaceToPan({ children }: { children: ReactNode }) {
  const interaction = useInteraction();
  // Only over the pages, so Space still scrolls the rest of your page.
  const over = useRef(false);

  useEffect(() => {
    let held = false;
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !over.current) return;
      event.preventDefault();
      if (event.repeat || held) return;
      held = true;
      interaction.pushTool('pan');
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !held) return;
      held = false;
      interaction.popTool();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [interaction]);

  return (
    <div
      className="viewer"
      onPointerEnter={() => (over.current = true)}
      onPointerLeave={() => (over.current = false)}
    >
      {children}
    </div>
  );
}

function ActiveTool() {
  const { activeToolId } = useInteractionState();
  const panning = activeToolId === 'pan';

  return (
    <div className="toolbar">
      <span className="badge" data-active={panning}>
        {panning ? 'Hand' : 'Select'}
      </span>
      <span className="readout">
        {panning ? 'Drag to scroll, then let go of Space' : 'Hold Space over the pages to scroll'}
      </span>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ActiveTool />
        <HoldSpaceToPan>
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <SelectionLayer />
              </>
            )}
          </Stage>
        </HoldSpaceToPan>
      </DocumentGate>
    </Viewer>
  );
}
