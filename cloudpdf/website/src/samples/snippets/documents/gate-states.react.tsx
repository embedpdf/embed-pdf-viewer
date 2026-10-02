import { DocumentGate } from '@embedpdf/react/runtime';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';
import { PasswordForm } from './PasswordForm';
import { Spinner } from './Spinner';

export function DocumentView() {
  return (
    <DocumentGate
      fallback={<Spinner />}
      locked={(document) => <PasswordForm document={document} />}
      error={(document) => <p>Couldn't open {document.name}: {document.error.message}</p>}
    >
      <Stage>{() => <RenderLayer />}</Stage>
    </DocumentGate>
  );
}
