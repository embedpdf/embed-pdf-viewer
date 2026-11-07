'use client';

import { localEngine } from '@embedpdf/engine';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { DocumentGate, Viewer } from '@embedpdf/react/runtime';
import { SearchLayer, searchPlugin, useSearch, useSearchState } from '@embedpdf/react/search';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const button = 'size-8 rounded-full hover:bg-white/15 disabled:opacity-40';

// Your own toolbar: a floating pill with zoom and search.
function Toolbar() {
  const stage = useStage();
  const { zoomLevel } = useStageState();
  const search = useSearch();
  const { hitCount, activeHitIndex } = useSearchState();

  return (
    <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#1a1530] p-1.5 text-sm text-white shadow-xl">
      <button className={button} onClick={() => stage.zoomOut()}>
        −
      </button>
      <span className="w-12 text-center tabular-nums">{Math.round(zoomLevel * 100)}%</span>
      <button className={button} onClick={() => stage.zoomIn()}>
        +
      </button>
      <input
        className="mx-1 w-28 rounded-full bg-white/10 px-3 py-1.5 outline-none placeholder:text-white/50"
        placeholder="Search"
        onChange={(event) => search.search({ text: event.target.value })}
      />
      <span className="w-10 text-center tabular-nums text-white/70">
        {hitCount > 0 ? `${activeHitIndex + 1}/${hitCount}` : '–'}
      </span>
      <button className={button} disabled={hitCount === 0} onClick={() => search.nextHit()}>
        ↓
      </button>
    </div>
  );
}

export function CustomViewer() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[
        { source: { kind: 'url', url: '/embedpdf-documents-belong-on-the-web.pdf' } },
      ]}
    >
      <DocumentGate fallback={<p className="p-6 text-sm text-slate-500">Opening…</p>}>
        <div className="relative h-full bg-violet-50">
          <Stage style={{ height: '100%' }}>
            {() => (
              <>
                <RenderLayer />
                <SearchLayer />
              </>
            )}
          </Stage>
          <Toolbar />
        </div>
      </DocumentGate>
    </Viewer>
  );
}
