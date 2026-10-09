import { Component, inject } from '@angular/core';
import { EpdfSignature } from '@embedpdf/angular/signature';

@Component({
  selector: 'app-signature-list',
  template: `
    <ul>
      @for (sig of signature.signatures(); track sig.fieldName) {
        <li>{{ sig.fieldName }}: {{ sig.verdict?.summary ?? 'checking…' }}</li>
      }
    </ul>
  `,
})
export class SignatureList {
  protected readonly signature = inject(EpdfSignature);
}
