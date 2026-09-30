import { Viewer } from '@embedpdf/react/runtime';
import { archive, engine, plugins, report } from './pdf';

export function ReviewViewer() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
      scope={[
        'doc.open',
        'doc.render',
        'doc.text.select',
        'doc.annotate.read',
        'annotations:create:self',
        'annotations:update:self',
        'annotations:delete:self',
      ]}
      initialDocuments={[
        { source: report },
        { source: archive, scope: ['doc.open', 'doc.render'] }, // this one is read-only
      ]}
    />
  );
}
