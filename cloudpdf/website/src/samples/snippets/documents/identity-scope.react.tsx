import { Viewer } from '@embedpdf/react/runtime';
import { engine, plugins } from './pdf';

export function ReviewViewer() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
      scope={['doc.open', 'doc.render', 'doc.text.select', 'doc.annotate.read', 'annotations:create:self']}
    />
  );
}
