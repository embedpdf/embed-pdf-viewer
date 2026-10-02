import { useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './pins.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// A pin is a page and a point on it, in points from the page's top-left. No pixels.
interface Pin {
  pageIndex: number;
  point: { x: number; y: number };
}

function Controls({ last, onClear }: { last: Pin | null; onClear: () => void }) {
  const stage = useStage();

  return (
    <div className="toolbar">
      <button type="button" className="button" onClick={() => stage.zoomOut()}>
        Zoom out
      </button>
      <button type="button" className="button" onClick={() => stage.zoomIn()}>
        Zoom in
      </button>
      <button type="button" className="button" onClick={() => stage.rotateViewBy(90)}>
        Rotate ⟳
      </button>
      <button type="button" className="button" onClick={onClear}>
        Clear pins
      </button>
      <output className="badge">
        {last ? (
          <>
            page <strong>{last.pageIndex + 1}</strong> · x{' '}
            <strong>{last.point.x.toFixed(1)}</strong> · y{' '}
            <strong>{last.point.y.toFixed(1)}</strong>
          </>
        ) : (
          'Click a page to drop a pin'
        )}
      </output>
    </div>
  );
}

export default function App() {
  // One pin to start with: an inch in from the first page's top-left corner.
  const [pins, setPins] = useState<Pin[]>([{ pageIndex: 0, point: { x: 72, y: 72 } }]);
  // Where the pointer went down: a press that moved was a drag to scroll, not a click.
  const pressed = useRef({ x: 0, y: 0 });

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Controls last={pins[pins.length - 1] ?? null} onClear={() => setPins([])} />
        <Stage
          className="stage"
          // What's drawn here sits over the page and never turns with it, so it
          // converts with pageToView, which includes the turn.
          pageChrome={(page) => (
            <div
              className="surface"
              onPointerDown={(event) => (pressed.current = { x: event.clientX, y: event.clientY })}
              onClick={(event) => {
                const moved = Math.hypot(
                  event.clientX - pressed.current.x,
                  event.clientY - pressed.current.y,
                );
                if (moved > 4) return;
                // A pointer event, to a point on the page.
                const point = page.toPagePoint(event.clientX, event.clientY);
                setPins((current) => [...current, { pageIndex: page.pageIndex, point }]);
              }}
            >
              {page.pageIndex === 0 ? (
                // Many things at once: the browser maps page points with one matrix.
                <div className="page-space" style={{ transform: page.transform.cssMatrix }}>
                  <div className="inch">1 inch</div>
                </div>
              ) : null}
              {pins
                .filter((pin) => pin.pageIndex === page.pageIndex)
                .map((pin, index) => {
                  // A point on the page, to pixels on it: at the last moment.
                  const at = page.transform.pageToView(pin.point);
                  return <div key={index} className="pin" style={{ left: at.x, top: at.y }} />;
                })}
            </div>
          )}
        >
          {() => <RenderLayer />}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
