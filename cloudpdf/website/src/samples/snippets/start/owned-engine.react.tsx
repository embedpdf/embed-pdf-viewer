import { Viewer } from '@embedpdf/react/runtime';
import { cloudEngine } from '@cloudpdf/engine';
import { plugins } from './pdf';

export function DocumentViewer() {
  return <Viewer engine={() => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' })} plugins={plugins} />;
}
