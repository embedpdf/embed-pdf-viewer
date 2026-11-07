import { Component, signal, ViewEncapsulation } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';

// [!doc-source welcome]
const welcome = '/pdfs/welcome.pdf';
// [!/doc-source]

// Your own words for two of the viewer's labels, in each language.
const strings = {
  en: { 'mode:annotate': 'Review', 'document:download': 'Save a copy' },
  de: { 'mode:annotate': 'Prüfen', 'document:download': 'Kopie speichern' },
  fr: { 'mode:annotate': 'Relire', 'document:download': 'Enregistrer une copie' },
  nl: { 'mode:annotate': 'Nakijken', 'document:download': 'Kopie opslaan' },
  ar: { 'mode:annotate': 'مراجعة', 'document:download': 'حفظ نسخة' },
};

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  styleUrl: './languages.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="app">
      <header class="bar">
        <select
          #picker
          aria-label="Language"
          [value]="locale()"
          (change)="locale.set(picker.value)"
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
          <option value="nl">Nederlands</option>
          <option value="ar">العربية</option>
        </select>
      </header>
      <epdf-pdf-viewer class="viewer" [src]="welcome" [strings]="strings" [locale]="locale()" />
    </div>
  `,
})
export class App {
  readonly welcome = welcome;
  readonly strings = strings;
  readonly locale = signal('en');
}
