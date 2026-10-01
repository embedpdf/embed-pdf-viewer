import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import type { RevealZoom } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './reveal.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Spots to jump to: a page index and a box in page coordinates (points from
// the page's top-left), like a search hit or a comment would give you.
const SPOTS = [
  { label: 'Top of page 2', page: 1, rect: { x: 72, y: 72, width: 468, height: 96 } },
  { label: 'Middle of page 3', page: 2, rect: { x: 72, y: 340, width: 468, height: 120 } },
  { label: 'Corner of page 4', page: 3, rect: { x: 330, y: 620, width: 210, height: 110 } },
];

const ZOOMS: { label: string; zoom: RevealZoom }[] = [
  { label: 'Keep zoom', zoom: 'keep' },
  { label: 'Fit width', zoom: 'fit-width' },
  { label: 'Fit the box', zoom: 'fit' },
];

export default function App() {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<RevealZoom>('fit-width');

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SpotPicker active={active} zoom={zoom} onActive={setActive} onZoom={setZoom} />
        <Stage
          className="stage"
          pageChrome={(page) =>
            SPOTS.map((spot, index) => {
              if (spot.page !== page.pageIndex) return null;
              // Page coordinates become pixels only here, as the spot is drawn.
              const box = page.transform.pageToViewRect(spot.rect);
              return (
                <div
                  key={spot.label}
                  className="spot"
                  data-active={index === active}
                  style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
                />
              );
            })
          }
        >
          {() => <RenderLayer />}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

function SpotPicker({
  active,
  zoom,
  onActive,
  onZoom,
}: {
  active: number;
  zoom: RevealZoom;
  onActive: (index: number) => void;
  onZoom: (zoom: RevealZoom) => void;
}) {
  const stage = useStage();
  const pageCount = useStageState((state) => state.pageCount);

  const reveal = (index: number, revealZoom: RevealZoom) => {
    const spot = SPOTS[index];
    // The box lands about a third from the top, like a browser's find bar.
    stage.reveal(spot.page, { rect: spot.rect, zoom: revealZoom, anchor: { y: 0.35 } });
    onActive(index);
  };

  // Open on the first spot.
  useEffect(() => {
    stage.reveal(SPOTS[0].page, { rect: SPOTS[0].rect, zoom: 'fit-width', anchor: { y: 0.35 } });
  }, [stage]);

  return (
    <div className="toolbar">
      <div className="spots">
        {SPOTS.map((spot, index) => (
          <button
            key={spot.label}
            type="button"
            className="button"
            aria-pressed={index === active}
            disabled={spot.page >= pageCount}
            onClick={() => reveal(index, zoom)}
          >
            {spot.label}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Zoom">
        {ZOOMS.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={option.zoom === zoom}
            onClick={() => onZoom(option.zoom)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
