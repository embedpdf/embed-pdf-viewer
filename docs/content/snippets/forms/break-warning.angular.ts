import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfSignature } from '@embedpdf/angular/signature';
import { toast } from './toast';

@Component({ selector: 'app-signature-guard', template: '' })
export class SignatureGuard {
  private readonly signature = inject(EpdfSignature);

  constructor() {
    this.signature.invalidationPredicted$.pipe(takeUntilDestroyed()).subscribe(({ field }) => {
      const name = this.signature.getSignature(field)?.fieldName;
      toast(`This change will break the signature in "${name}" when saved.`);
    });
  }
}
