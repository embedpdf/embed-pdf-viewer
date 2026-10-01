import { useSearch, useSearchHits } from '@embedpdf/react/search';

export function Results() {
  const search = useSearch();
  const hits = useSearchHits();

  return (
    <ol>
      {hits.map((hit, index) => (
        <li key={index}>
          <button type="button" onClick={() => search.goToHit(hit)}>
            Page {hit.pageIndex + 1}: …{hit.snippet?.before}
            <mark>{hit.snippet?.match}</mark>
            {hit.snippet?.after}…
          </button>
        </li>
      ))}
    </ol>
  );
}
