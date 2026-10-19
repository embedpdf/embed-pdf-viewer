import { Component, computed, viewChild } from '@angular/core';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';
import { BottomSheet, SidePanel } from './panels';

@Component({
  selector: 'app-reader',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, BottomSheet, SidePanel],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>

    @if (compact()) {
      <app-bottom-sheet />
    } @else {
      <app-side-panel />
    }
  `,
})
export class Reader {
  private readonly stage = viewChild(EpdfStage);

  protected readonly compact = computed(
    () => this.stage()?.activeRules().includes('compact') ?? false,
  );
}
