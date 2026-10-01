import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  SelectionClipboard,
  SelectionLayer,
  SelectionMenu,
  copySelection,
  selectionPlugin,
  useSelection,
} from '@embedpdf/react/selection';
import { cloudEngine } from '@cloudpdf/engine';

import './menu.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const PLACEMENTS = ['top', 'bottom', 'left', 'right'] as const;
type Placement = (typeof PLACEMENTS)[number];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// What's in the menu is yours: here, copy and clear.
function SelectionActions() {
  const selection = useSelection();

  const copy = () => {
    void copySelection(selection).catch(() => {
      // Show your product's clipboard error message here.
    });
  };

  return (
    <div className="menu">
      {selection.canCopy() && (
        <button type="button" className="button" onClick={copy}>
          Copy
        </button>
      )}
      <button type="button" className="button" onClick={() => selection.clear()}>
        Clear
      </button>
    </div>
  );
}

// Something selected on load, so the menu shows: the title on the cover.
function SelectTitle() {
  const selection = useSelection();
  const cover = usePageList()[0]?.ref;

  useEffect(() => {
    if (cover) selection.select({ page: cover, start: 10, count: 52 });
  }, [selection, cover]);

  return null;
}

export default function App() {
  const [placement, setPlacement] = useState<Placement>('top');

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectTitle />
        <SelectionClipboard />
        <div className="toolbar" role="group" aria-label="Where the menu goes">
          {PLACEMENTS.map((name) => (
            <button
              key={name}
              type="button"
              className="segment"
              aria-pressed={placement === name}
              onClick={() => setPlacement(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <Stage
          className="stage"
          overlay={
            <SelectionMenu placement={placement} gap={8}>
              <SelectionActions />
            </SelectionMenu>
          }
        >
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
