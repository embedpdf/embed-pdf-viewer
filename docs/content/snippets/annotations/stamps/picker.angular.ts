import { Component, inject, input } from '@angular/core';
import { EpdfStamp } from '@embedpdf/angular/stamp';

import { StampPreview } from './preview';

@Component({
  selector: 'app-stamp-picker',
  imports: [StampPreview],
  template: `
    @for (asset of assets(); track asset.id) {
      <button (click)="stamp.armAsset(asset.id)">
        <app-stamp-preview [assetId]="asset.id" />
        {{ asset.label }}
      </button>
    }
  `,
})
export class StampPicker {
  readonly libraryId = input.required<string>();

  protected readonly stamp = inject(EpdfStamp);
  protected readonly assets = this.stamp.assetsOf(() => ({ libraryId: this.libraryId() }));
}
