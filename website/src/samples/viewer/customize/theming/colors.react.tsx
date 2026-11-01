import { useState } from 'react';
import { PDFViewer, type ThemeConfig } from '@embedpdf/viewer-react';

import './colors.css';

const welcome = '/pdfs/welcome.pdf';

// Your colors for both modes, and what's different in dark.
const brand: ThemeConfig = {
  accent: '#0f6e56',
  tokens: { surface: '#fbfaf7', canvas: '#ece8df', radius: '2px' },
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
