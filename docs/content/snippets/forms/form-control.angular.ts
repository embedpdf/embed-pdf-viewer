import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { EpdfForm, toFieldRef } from '@embedpdf/angular/form';

@Component({
  selector: 'app-billing-name',
  imports: [ReactiveFormsModule],
  template: `
    <label>
      Name
      <input [formControl]="name" />
    </label>
  `,
})
export class BillingName {
  protected readonly name = inject(EpdfForm).controlOf(toFieldRef('billing.name'));
}
