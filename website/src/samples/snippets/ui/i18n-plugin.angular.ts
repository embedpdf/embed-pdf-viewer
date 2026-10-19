import { Component } from '@angular/core';
import { negotiateLocale, withI18n } from '@embedpdf/angular/i18n';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import en from './locales/en';
import { engine } from './pdf';

const locale = negotiateLocale(['en', 'nl', 'de'], navigator.languages) ?? 'en';

@Component({
  selector: 'app-document-viewer',
  providers: [
    provideEmbedPdf(
      { engine },
      /* … */
      withI18n({
        locale,
        locales: [{ code: 'en', name: 'English', translations: en }],
        loaders: {
          nl: () => import('./locales/nl').then((module) => module.default),
          de: () => import('./locales/de').then((module) => module.default),
        },
      }),
    ),
  ],
  template: `<!-- your toolbar and pages -->`,
})
export class DocumentViewer {}
