import { Component, input } from '@angular/core';
import { injectFontCss } from '@embedpdf/angular/fonts';

@Component({
  selector: 'app-font-preview',
  template: `
    <input
      value="Hello שלום"
      [style.font-family]="css()?.fontFamily"
      [style.font-weight]="css()?.fontWeight"
      [style.font-style]="css()?.fontStyle"
      style="font-synthesis: none"
    />
  `,
})
export class FontPreview {
  readonly font = input.required<string>();
  // Its programs are mounted while this component lives.
  protected readonly css = injectFontCss(() => this.font());
}
