import { AnnotationLayer } from '@embedpdf/react/annotation';
import { RenderLayer } from '@embedpdf/react/render';
import { SearchLayer } from '@embedpdf/react/search';
import { SelectionLayer } from '@embedpdf/react/selection';
import { Stage } from '@embedpdf/react/stage';

export function Pages() {
  return (
    <Stage>
      {() => (
        <>
          <RenderLayer />
          <SearchLayer />
          <SelectionLayer />
          <AnnotationLayer />
        </>
      )}
    </Stage>
  );
}
