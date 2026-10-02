import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, pageRefsEqual } from '@embedpdf/react/runtime';
import type { OpenInput, PageContextValue, PageRef } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  interactionPlugin,
  svgCursor,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import { localEngine } from '@embedpdf/engine';

import './pin.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

interface Pin {
  readonly id: number;
  readonly page: PageRef;
  readonly point: { readonly x: number; readonly y: number };
}

// The cursor is the pin itself; its tip is the point that clicks.
const PIN_CURSOR = svgCursor({
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M12 23s7.5-7.4 7.5-12.5a7.5 7.5 0 0 0-15 0C4.5 15.6 12 23 12 23z" fill="#e5484d" stroke="#fff" stroke-width="1.5"/>
    <circle cx="12" cy="10.5" r="2.8" fill="#fff"/>
  </svg>`,
  hotspot: { x: 12, y: 23 },
  fallback: 'copy',
});

// The pins on one page, placed in its pixels at the last moment.
function PinLayer({ page, pins }: { page: PageContextValue; pins: readonly Pin[] }) {
  return (
    <>
      {pins
        .filter((pin) => pageRefsEqual(pin.page, page.ref))
        .map((pin) => {
          const { x, y } = page.transform.toPixels(pin.point);
          return (
            <span key={pin.id} className="pin" style={{ left: x, top: y }}>
              {pin.id}
            </span>
          );
        })}
    </>
  );
}

function PinBoard() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const [pins, setPins] = useState<readonly Pin[]>([]);

  // A tool of your own: a click on a page drops a pin there, in page coordinates.
  useEffect(() => {
    const remove = interaction.registerTool({
      id: 'pin',
      cursor: PIN_CURSOR,
      onPointerDown: ({ page, point }) => {
        setPins((current) => [...current, { id: current.length + 1, page, point }]);
        return true; // this tool handled the click
      },
    });
    interaction.activateTool('pin');
    return remove;
  }, [interaction]);

  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Tool">
          <button
            type="button"
            className="segment"
            aria-pressed={activeToolId === 'pin'}
            onClick={() => interaction.activateTool('pin')}
          >
            Pin
          </button>
          <button
            type="button"
            className="segment"
            aria-pressed={activeToolId === 'pan'}
            onClick={() => interaction.activateTool('pan')}
          >
            Hand
          </button>
        </div>
        <button
          type="button"
          className="button"
          disabled={pins.length === 0}
          onClick={() => setPins([])}
        >
          Clear
        </button>
        <output className="readout">
          {pins.length === 0 ? 'Click a page to drop a pin' : `${pins.length} pins`}
        </output>
      </div>
      <Stage className="stage">
        {(page) => (
          <>
            <RenderLayer />
            <PinLayer page={page} pins={pins} />
          </>
        )}
      </Stage>
    </>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PinBoard />
      </DocumentGate>
    </Viewer>
  );
}
