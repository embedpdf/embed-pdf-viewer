import { useSearch, useSearchState } from '@embedpdf/react/search';

export function SearchBox() {
  const search = useSearch();
  const { hitCount, activeHitIndex } = useSearchState();

  return (
    <>
      <input onChange={(event) => search.search({ text: event.target.value })} />
      <span>
        {activeHitIndex + 1} of {hitCount}
      </span>
      <button onClick={() => search.nextHit()}>Next</button>
    </>
  );
}
