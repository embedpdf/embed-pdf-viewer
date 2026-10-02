/** The props of `<SearchLayer>`. */
import type { SearchHit } from '@embedpdf/plugin-search';

export interface SearchLayerProps {
  /**
   * Make matches clickable: called with the match someone clicks, for example to make it the
   * active one with `search.goToHit(hit)`. The press still reaches the page, so a drag that
   * starts on a match selects text, and only a click calls this. Without it, matches are only
   * paint and the pointer goes straight through.
   */
  onHitClick?: (hit: SearchHit) => void;
}
