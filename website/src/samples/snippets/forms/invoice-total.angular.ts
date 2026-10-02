import { Component, inject } from '@angular/core';
import { EpdfForm, toFieldRef } from '@embedpdf/angular/form';

@Component({
  selector: 'app-invoice-total',
  template: `
    @let current = total();
    @if (current && 'value' in current) {
      <output>{{ current.value }}</output>
    }
  `,
})
export class InvoiceTotal {
  protected readonly total = inject(EpdfForm).valueOf(toFieldRef('invoice.total'));
}
