import { Component, computed, inject, model } from '@angular/core';
import { EpdfFonts } from '@embedpdf/angular/fonts';

@Component({
  selector: 'app-font-select',
  template: `
    <select #field (change)="value.set(field.value)">
      @for (font of choosable(); track font.name) {
        <option [value]="font.name" [selected]="font.name === value()">{{ font.name }}</option>
      }
    </select>
  `,
})
export class FontSelect {
  readonly value = model.required<string>();
  private readonly fonts = inject(EpdfFonts);
  protected readonly choosable = computed(
    () => this.fonts.list()?.fonts.filter((font) => font.canChoose) ?? [],
  );
}
