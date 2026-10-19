import { useFilePickerProvider } from '@embedpdf/react/annotation';

import { openStampLibrary } from './stamp-library';

export function Toolbar() {
  useFilePickerProvider(async ({ toolId, page, point }) => {
    if (toolId === 'stamp') return { data: await openStampLibrary() };
    return null;
  });

  return <div role="toolbar">{/* your tools */}</div>;
}
