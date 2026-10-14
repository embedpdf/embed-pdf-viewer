import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, pageRefsEqual } from '@embedpdf/react/runtime';
import type { OpenInput, PageContextValue, PageRef } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin, useInteraction } from '@embedpdf/react/interaction';
import { localEngine } from '@embedpdf/engine';

import './ruler.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Measurement {
  readonly page: PageRef;
  readonly from: Point;
  readonly to: Point;
}

// Page coordinates are points, 72 to the inch.
const lengthOf = ({ from, to }: Measurement) => {
  const inches = Math.hypot(to.x - from.x, to.y - from.y) / 72;
  return `${inches.toFixed(2)} in · ${(inches * 2.54).toFixed(1)} cm`;
};

// The measured line on its page, placed in the page's pixels.
function RulerLayer({
  page,
  measurement,
}: {
  page: PageContextValue;
  measurement: Measurement | null;
}) {
  if (!measurement || !pageRefsEqual(measurement.page, page.ref)) return null;
  const from = page.transform.toPixels(measurement.from);
  const to = page.transform.toPixels(measurement.to);

  return (
    <>
      <svg className="ruler-layer">
        <line className="ruler-line" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
        <circle className="ruler-end" cx={from.x} cy={from.y} r={4} />
        <circle className="ruler-end" cx={to.x} cy={to.y} r={4} />
      </svg>
      <span className="ruler-label" style={{ left: (from.x + to.x) / 2, top: (from.y + to.y) / 2 }}>
        {lengthOf(measurement)}
      </span>
    </>
  );
}

function Ruler() {
  const interaction = useInteraction();
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);

  // A tool you drag with: the press starts a line, the moves stretch it, the release ends it.
  useEffect(() => {
    const remove = interaction.registerTool({
      id: 'ruler',
      cursor: 'crosshair',
      touch: 'draw', // one finger measures, two fingers scroll and zoom
      onPointerDown: ({ page, point }) => {
        setMeasurement({ page, from: point, to: point });
        return true;
      },
      onPointerMove: ({ point }) => {
        setMeasurement((current) => current && { ...current, to: point });
      },
      onPointerUp: ({ point }) => {
        setMeasurement((current) => current && { ...current, to: point });
      },
      onHover: ({ point }) => setPointer(point),
    });
    interaction.activateTool('ruler');
    return remove;
  }, [interaction]);

  return (
    <>
      <div className="toolbar">
        <output className="readout">
          {measurement ? lengthOf(measurement) : 'Drag on a page to measure'}
        </output>
        <output className="readout muted">
          {pointer ? `x ${Math.round(pointer.x)} · y ${Math.round(pointer.y)} pt` : ''}
        </output>
      </div>
      <Stage className="stage">
        {(page) => (
          <>
            <RenderLayer />
            <RulerLayer page={page} measurement={measurement} />
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
        <Ruler />
      </DocumentGate>
    </Viewer>
  );
}
