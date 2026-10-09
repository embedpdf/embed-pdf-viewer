import { Component, computed, inject } from '@angular/core';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  EpdfAnnotationMenu,
} from '@embedpdf/angular/annotation';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-pages',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfAnnotationLayer, EpdfAnnotationMenu],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-annotation-layer />
      </ng-template>

      <epdf-annotation-menu placement="bottom">
        <div class="menu">
          @if (allText()) {
            <button (click)="annotation.text.toggleFormat('bold')">Bold</button>
          }
          <button (click)="annotation.selection.update({ color: '#dc143c' })">Red</button>
          <button (click)="annotation.selection.delete()">Delete</button>
        </div>
      </epdf-annotation-menu>
    </epdf-stage>
  `,
})
export class Pages {
  protected readonly annotation = inject(EpdfAnnotation);
  protected readonly allText = computed(() =>
    this.annotation.selected().every((a) => a.subtype === 'free-text'),
  );
}
