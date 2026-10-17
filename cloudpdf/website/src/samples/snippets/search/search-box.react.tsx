import { RenderLayer } from '@embedpdf/react/render';
import { SearchLayer, useSearch, useSearchState } from '@embedpdf/react/search';
import { Stage } from '@embedpdf/react/stage';

export function SearchBox() {
  const search = useSearch();
  const { hitCount, activeHitIndex, status } = useSearchState();

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <input onChange={(event) => search.search({ text: event.target.value })} />
      {status === 'searching' && <span>Searching…</span>}
      {hitCount > 0 && (
        <span>
          {activeHitIndex + 1} of {hitCount}
        </span>
      )}
      <button type="button" onClick={() => search.previousHit()}>↑</button>
      <button type="button" onClick={() => search.nextHit()}>↓</button>
    </form>
  );
}

export function Pages() {
  return (
    <Stage>
      {() => (
        <>
          <RenderLayer />
          <SearchLayer />
        </>
      )}
    </Stage>
  );
}
