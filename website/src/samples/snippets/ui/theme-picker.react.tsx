import { useState } from 'react';
import { epdfTheme } from '@embedpdf/react/runtime';

import { Pages } from './pages';

export function BrandedViewer() {
  const [accent, setAccent] = useState('#e91e63');

  return (
    <div className="pdf-viewer" style={epdfTheme({ accent })}>
      <input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} />
      <Pages />
    </div>
  );
}
