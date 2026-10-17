import { Component } from '@angular/core';
import { withForm } from '@embedpdf/angular/form';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { indexedDbKeyStore, personalSigner, withSignature } from '@embedpdf/angular/signature';
import { withStamp } from '@embedpdf/angular/stamp';
import { rootCertificate } from './certificates';
import { engine } from './pdf';

@Component({
  selector: 'app-signing',
  providers: [
    provideEmbedPdf(
      { engine },
      /* … */
      withForm(),
      withStamp(),
      withSignature({
        key: () => personalSigner({ subject: 'Ada Lovelace', store: indexedDbKeyStore('my-app-keys') }),
        trust: { anchors: async () => [rootCertificate] }, // the certificates you trust
      }),
    ),
  ],
  template: `<!-- … -->`,
})
export class Signing {}
