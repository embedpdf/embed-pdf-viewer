import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SearchLayer, searchPlugin, useSearch, useSearchState } from '@embedpdf/react/search';
import { Anchored } from '@embedpdf/react/anchored';
import type { AnchoredPlacement, AnchoredSide } from '@embedpdf/react/anchored';
import { localEngine } from '@embedpdf/engine';

import './placement.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const SIDES: AnchoredSide[] = ['top', 'right', 'bottom', 'left'];
const ALIGNS = ['start', 'center', 'end'] as const;

// A card next to the active match, where you put it, `gap` pixels away.
function MatchCard(props: { placement: AnchoredPlacement; gap: number; pinned: boolean }) {
  const search = useSearch();
  const { activeHit, activeHitIndex, hitCount } = useSearchState();

  return (
    <Anchored
      anchor={activeHit && { page: activeHit.page, bounds: activeHit.bounds }}
      placement={props.placement}
      gap={props.gap}
      pinned={props.pinned}
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
  const [side, setSide] = useState<AnchoredSide>('top');
  const [align, setAlign] = useState<(typeof ALIGNS)[number]>('center');
  const [gap, setGap] = useState(8);
  const [pinned, setPinned] = useState(false);
  const placement: AnchoredPlacement = align === 'center' ? side : `${side}-${align}`;

  useEffect(() => {
    void search.search({ text: 'PDF' }).then(() => search.revealActiveHit());
  }, [search]);

  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Side">
          {SIDES.map((each) => (
            <button
              key={each}
              type="button"
              role="radio"
              aria-checked={each === side}
              className="segment"
              onClick={() => setSide(each)}
            >
              {each}
            </button>
          ))}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Along the side">
          {ALIGNS.map((each) => (
            <button
              key={each}
              type="button"
              role="radio"
              aria-checked={each === align}
              className="segment"
              onClick={() => setAlign(each)}
            >
              {each}
            </button>
          ))}
        </div>
        <label className="range">
          Gap {gap} px
          <input
            type="range"
            min={-24}
            max={32}
            value={gap}
            onChange={(event) => setGap(Number(event.target.value))}
          />
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
          />
          Pinned
        </label>
      </div>
      <Stage
        className="stage"
        overlay={<MatchCard placement={placement} gap={gap} pinned={pinned} />}
      >
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
