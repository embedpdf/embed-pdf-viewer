'use client';

import { Viewer } from '@embedpdf/react/runtime';
import { engine, plugins } from './pdf';

export function DocumentViewer() {
  return <Viewer engine={engine} plugins={plugins}>{/* … */}</Viewer>;
}
