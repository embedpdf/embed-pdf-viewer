import { DocumentScope } from '@embedpdf/react/runtime';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';
import { ZoomControls } from './ZoomControls';

export function DocumentView({ documentId }: { documentId: string }) {
  return (
    <DocumentScope id={documentId}>
      <Stage>{() => <RenderLayer />}</Stage>
      <ZoomControls />
    </DocumentScope>
  );
}
