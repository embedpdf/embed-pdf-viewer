import { useSearchEvent } from '@embedpdf/react/search';
import { announce } from './announce';

export function MatchAnnouncer() {
  useSearchEvent(
    (search) => search.onCompleted,
    ({ hitCount }) => announce(`${hitCount} matches`),
  );

  return null;
}
