import { Component, inject } from '@angular/core';
import { isPluginError } from '@embedpdf/angular/runtime';
import { EpdfForm, toFieldRef } from '@embedpdf/angular/form';

@Component({
  selector: 'app-set-total-button',
  template: `<button (click)="setTotal()">Set the total</button>`,
})
export class SetTotalButton {
  private readonly form = inject(EpdfForm);

  protected async setTotal() {
    try {
      await this.form.setValue(toFieldRef('total'), { value: '120.00' });
    } catch (error) {
      if (isPluginError(error, 'permission-denied')) {
        console.log(error.permission); // what was missing, such as 'doc.forms.fill'
      }
    }
  }
}
