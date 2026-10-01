import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SearchLayer, searchPlugin, useSearch, useSearchState } from '@embedpdf/react/search';
import { Anchored } from '@embedpdf/react/anchored';
import type { AnchoredPlacement } from '@embedpdf/react/anchored';
import { localEngine } from '@embedpdf/engine';

import './placement.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const PLACEMENTS: AnchoredPlacement[] = ['top', 'right', 'bottom', 'left'];

// A card next to the active match, on the side you pick, `gap` pixels away.
function MatchCard({ placement, gap }: { placement: AnchoredPlacement; gap: number }) {
  const search = useSearch();
  const { activeHit, activeHitIndex, hitCount } = useSearchState();

  return (
    <Anchored
      anchor={activeHit && { page: activeHit.page, bounds: activeHit.bounds }}
      placement={placement}
      gap={gap}
    >
      <div className="card">
        <span className="card-title">
          Match {activeHitIndex + 1} of {hitCount}
        </span>
        <span className="card-page">Page {(activeHit?.pageIndex ?? 0) + 1}</span>
        <div className="card-steps">
          <button
            type="button"
            className="step"
            aria-label="Previous match"
            onClick={() => search.previousHit()}
          >
            ←
          </button>
          <button
            type="button"
            className="step"
            aria-label="Next match"
            onClick={() => search.nextHit()}
          >
            →
          </button>
        </div>
      </div>
    </Anchored>
  );
}

function Pages() {
  const search = useSearch();
  const [placement, setPlacement] = useState<AnchoredPlacement>('top');
  const [gap, setGap] = useState(8);

  useEffect(() => {
    void search.search({ text: 'PDF' }).then(() => search.revealActiveHit());
  }, [search]);

  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Placement">
          {PLACEMENTS.map((side) => (
            <button
              key={side}
              type="button"
              role="radio"
              aria-checked={side === placement}
              className="segment"
              onClick={() => setPlacement(side)}
            >
              {side}
            </button>
          ))}
        </div>
        <label className="range">
          Gap {gap} px
          <input
            type="range"
            min={0}
            max={32}
            value={gap}
            onChange={(event) => setGap(Number(event.target.value))}
          />
        </label>
      </div>
      <Stage className="stage" overlay={<MatchCard placement={placement} gap={gap} />}>
        {() => (
          <>
            <RenderLayer />
            <SearchLayer />
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
        <Pages />
      </DocumentGate>
    </Viewer>
  );
}
