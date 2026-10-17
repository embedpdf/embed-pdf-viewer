import { Anchored } from '@embedpdf/react/anchored';
import { RenderLayer } from '@embedpdf/react/render';
import type { SearchHit } from '@embedpdf/react/search';
import { Stage } from '@embedpdf/react/stage';
import { highlight } from './highlight';

export function Pages({ hit }: { hit: SearchHit }) {
  return (
    <Stage
      overlay={
        <Anchored anchor={{ page: hit.page, bounds: hit.bounds }} placement="bottom">
          <button onClick={() => highlight(hit)}>Highlight</button>
        </Anchored>
      }
    >
      {() => <RenderLayer />}
    </Stage>
  );
}
