import { Component, inject, input } from '@angular/core';
import { EpdfStamp } from '@embedpdf/angular/stamp';

@Component({
  selector: 'app-stamp-preview',
  template: `
    @if (url(); as url) {
      <img [src]="url" alt="" />
    }
  `,
})
export class StampPreview {
  readonly assetId = input.required<string>();

  protected readonly url = inject(EpdfStamp).previewUrlOf(this.assetId);
}
