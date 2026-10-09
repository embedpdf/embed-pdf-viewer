import {
  AnnotationLayer,
  AnnotationMenu,
  useAnnotation,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';

function SelectionActions() {
  const annotation = useAnnotation();
  const { selected } = useAnnotationState();
  const allText = selected.every((a) => a.subtype === 'free-text');

  return (
    <div className="menu">
      {allText && <button onClick={() => annotation.text.toggleFormat('bold')}>Bold</button>}
      <button onClick={() => annotation.selection.update({ color: '#dc143c' })}>Red</button>
      <button onClick={() => annotation.selection.delete()}>Delete</button>
    </div>
  );
}

export function Pages() {
  return (
    <Stage
      overlay={
        <AnnotationMenu placement="bottom">
          <SelectionActions />
        </AnnotationMenu>
      }
    >
      {() => (
        <>
          <RenderLayer />
          <AnnotationLayer />
        </>
      )}
    </Stage>
  );
}
