import { Component, inject } from '@angular/core';
import { EpdfI18n } from '@embedpdf/angular/i18n';

@Component({
  selector: 'app-language-picker',
  template: `
    <select #picker [disabled]="i18n.loading() !== null" (change)="i18n.setLocale(picker.value)">
      @for (language of i18n.locales(); track language.code) {
        <option [value]="language.code" [selected]="language.code === i18n.locale()">
          {{ language.name }}
        </option>
      }
    </select>
  `,
})
export class LanguagePicker {
  protected readonly i18n = inject(EpdfI18n);
}
