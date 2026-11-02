import { useState } from 'react';
import { PDFViewer, type ThemeConfig } from '@cloudpdf/viewer-react';

import './colors.css';

const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

// What both modes share, then the colors of each.
const brand: ThemeConfig = {
  accent: '#0f6e56',
  tokens: { radius: '2px' },
  light: { surface: '#fbfaf7', canvas: '#ece8df' },
  dark: {
    accent: '#4fbf98',
    surface: '#16201c',
    'surface-raised': '#1d2a25',
    canvas: '#0c1210',
    hover: '#24332d',
  },
};

export default function App() {
  const [dark, setDark] = useState(false);
  return (
    <div className={dark ? 'app dark' : 'app'}>
      <header className="bar">
        <label>
          <input
            type="checkbox"
            checked={dark}
            onChange={(event) => setDark(event.target.checked)}
          />
          Dark
        </label>
      </header>
      <PDFViewer
        className="viewer"
        src={welcome}
        theme={{ ...brand, preference: dark ? 'dark' : 'light' }}
      />
    </div>
  );
}
