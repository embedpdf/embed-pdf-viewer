import { Component, inject } from '@angular/core';
import { EpdfMetadata } from '@embedpdf/angular/metadata';

@Component({
  selector: 'app-contract-number',
  template: `<span>Contract {{ metadata.custom()?.contractId }}</span>`,
})
export class ContractNumber {
  // metadata.custom() is { contractId: 'C-2026-114', reviewedBy: 'dana' }
  protected readonly metadata = inject(EpdfMetadata);
}
