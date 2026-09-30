import { AnnotationLayer } from '@embedpdf/react/annotation';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';

export function EditablePages() {
  return (
    <Stage>
      {() => (
        <>
          <RenderLayer annotations={false} />
          <AnnotationLayer />
        </>
      )}
    </Stage>
  );
}
