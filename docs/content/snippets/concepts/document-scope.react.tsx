import { DocumentScope } from '@embedpdf/react/runtime';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';

export function DocumentPane({ documentId }: { documentId: string }) {
  return (
    <DocumentScope id={documentId}>
      <Stage>{() => <RenderLayer />}</Stage>
    </DocumentScope>
  );
}
