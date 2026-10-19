import { SearchLayer, useSearch } from '@embedpdf/react/search';

export function PageMatches() {
  const search = useSearch();
  return <SearchLayer onHitClick={(hit) => search.goToHit(hit)} />;
}
