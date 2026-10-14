import { Viewer } from '@embedpdf/react/runtime';

import { Pages } from './pages';
import { engine, plugins } from './pdf';

export function DocumentViewer() {
  return (
    <Viewer engine={engine} plugins={plugins} accent="#e91e63" page={{ shadow: 'none' }}>
      <Pages />
    </Viewer>
  );
}
