import { useState } from 'react';
import { PDFViewer } from '@embedpdf/viewer-react';

import './languages.css';

const welcome = '/pdfs/welcome.pdf';

// Your own words for two of the viewer's labels, in each language.
const strings = {
  en: { 'mode:annotate': 'Review', 'document:download': 'Save a copy' },
  de: { 'mode:annotate': 'Prüfen', 'document:download': 'Kopie speichern' },
  fr: { 'mode:annotate': 'Relire', 'document:download': 'Enregistrer une copie' },
  nl: { 'mode:annotate': 'Nakijken', 'document:download': 'Kopie opslaan' },
  ar: { 'mode:annotate': 'مراجعة', 'document:download': 'حفظ نسخة' },
};

export default function App() {
  const [locale, setLocale] = useState('en');
  return (
    <div className="app">
      <header className="bar">
        <select
          aria-label="Language"
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
          <option value="nl">Nederlands</option>
          <option value="ar">العربية</option>
        </select>
      </header>
      <PDFViewer className="viewer" src={welcome} strings={strings} locale={locale} />
    </div>
  );
}
