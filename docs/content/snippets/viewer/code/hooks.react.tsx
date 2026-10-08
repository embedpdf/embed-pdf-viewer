import { useSearch, useSearchState } from '@embedpdf/react/search';

// A search box of your own, in the viewer's header. The hooks are the headless ones.
export function HeaderSearch() {
  const search = useSearch();
  const { hitCount, activeHitIndex } = useSearchState();

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <input type="search" placeholder="Search" onChange={(event) => search.search({ text: event.target.value })} />
      {hitCount > 0 && <span>{activeHitIndex + 1} of {hitCount}</span>}
      <button type="button" onClick={() => search.nextHit()}>Next</button>
    </form>
  );
}
