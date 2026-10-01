import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, pageRefsEqual } from '@embedpdf/react/runtime';
import type { OpenInput, PageContextValue, PageRef } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin, useInteraction, useToolCursor } from '@embedpdf/react/interaction';
import { cloudEngine } from '@cloudpdf/engine';

import './cursor.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const COLORS = ['#e5484d', '#2f80ed', '#30a46c', '#1a2748'];

// A pen in the current color, with its tip at the bottom left.
const penIcon = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M3 21l1.6-5.6L16.2 3.8a2.2 2.2 0 0 1 3.1 3.1L7.7 18.5z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;

interface Dot {
  readonly id: number;
  readonly page: PageRef;
  readonly point: { readonly x: number; readonly y: number };
  readonly color: string;
}

// While this is mounted, the dot tool's crosshair is a pen in `color`.
function PenCursor({ color }: { color: string }) {
  useToolCursor({
    toolId: 'dot',
    cursors: { crosshair: { svg: penIcon(color), hotspot: { x: 3, y: 21 } } },
  });
  return null;
}

function DotLayer({ page, dots }: { page: PageContextValue; dots: readonly Dot[] }) {
  return (
    <>
      {dots
        .filter((dot) => pageRefsEqual(dot.page, page.ref))
        .map((dot) => {
          const { x, y } = page.transform.toPixels(dot.point);
          return (
            <span key={dot.id} className="dot" style={{ left: x, top: y, background: dot.color }} />
          );
        })}
    </>
  );
}

function Dots() {
  const interaction = useInteraction();
  const [color, setColor] = useState(COLORS[0]);
  const [penCursor, setPenCursor] = useState(true);
  const [dots, setDots] = useState<readonly Dot[]>([]);
  // The tool reads the color at the moment of the click.
  const colorRef = useRef(color);
  colorRef.current = color;

  useEffect(() => {
    const remove = interaction.registerTool({
      id: 'dot',
      cursor: 'crosshair',
      onPointerDown: ({ page, point }) => {
        setDots((current) => [
          ...current,
          { id: current.length + 1, page, point, color: colorRef.current },
        ]);
        return true;
      },
    });
    interaction.activateTool('dot');
    return remove;
  }, [interaction]);

  return (
    <>
      {penCursor && <PenCursor color={color} />}
      <div className="toolbar">
        <div className="swatches" role="radiogroup" aria-label="Color">
          {COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              role="radio"
              aria-checked={swatch === color}
              aria-label={swatch}
              className="swatch"
              style={{ background: swatch }}
              onClick={() => setColor(swatch)}
            />
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={penCursor}
            onChange={(event) => setPenCursor(event.target.checked)}
          />
          Pen cursor
        </label>
      </div>
      <Stage className="stage">
        {(page) => (
          <>
            <RenderLayer />
            <DotLayer page={page} dots={dots} />
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
        <Dots />
      </DocumentGate>
    </Viewer>
  );
}
