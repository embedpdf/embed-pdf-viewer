import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, copyImage, saveFile } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, SnapshotLayer, renderPlugin, useSnapshot } from '@embedpdf/react/render';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import { localEngine } from '@embedpdf/engine';

import './snapshot.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin({ defaultTool: 'pan' })];

// [!doc-source welcome]
const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function SnapshotToolbar() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const snapshot = useSnapshot();
  const [said, say] = useState('');
  // A new snapshot, or none: nothing copied yet.
  useEffect(() => say(''), [snapshot]);

  const copy = () => {
    if (!snapshot) return;
    // In the click itself: the picture goes to the clipboard as it comes.
    copyImage(snapshot.image).then(
      () => say('Copied: paste it anywhere'),
      () => say('This browser didn’t allow the copy'),
    );
  };
  const save = async () => {
    if (!snapshot) return;
    saveFile(await (await snapshot.image).blob(), 'snapshot.png');
  };

  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Tool">
        <button
          type="button"
          className="segment"
          aria-pressed={activeToolId === 'pan'}
          onClick={() => interaction.activateTool('pan')}
        >
          Hand
        </button>
        <button
          type="button"
          className="segment"
          aria-pressed={activeToolId === 'snapshot'}
          onClick={() => interaction.activateTool('snapshot')}
        >
          Snapshot
        </button>
      </div>
      <div className="actions">
        <button type="button" className="button" disabled={!snapshot} onClick={copy}>
          Copy
        </button>
        <button type="button" className="button" disabled={!snapshot} onClick={save}>
          Save
        </button>
      </div>
      <output className="readout">
        {said || (activeToolId === 'snapshot' && !snapshot ? 'Drag a box on a page' : '')}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: welcome }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SnapshotToolbar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SnapshotLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
