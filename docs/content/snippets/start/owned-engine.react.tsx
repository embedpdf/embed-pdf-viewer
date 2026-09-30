import { Viewer } from '@embedpdf/react/runtime';
import { localEngine } from '@embedpdf/engine';
import { plugins } from './pdf';

export function DocumentViewer() {
  return <Viewer engine={() => localEngine()} plugins={plugins} />;
}
