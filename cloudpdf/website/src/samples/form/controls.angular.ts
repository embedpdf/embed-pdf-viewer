import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfFieldControlTemplate, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import type { FormWidgetItem } from '@embedpdf/angular/form';
import { cloudEngine } from '@cloudpdf/engine';

const forms: OpenInput = { kind: 'grant', grant: 'shr_eBRW5E3MpolzD8G36Alp30EF' };

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfFormLayer,
    EpdfFieldControlTemplate,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine(), initialDocuments: [{ source: forms }] },
      withStage(),
      withRender(),
      withInteraction(),
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './controls.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <!-- The view's own controls: the switches follow the view when it zooms and turns. -->
      <div class="toolbar">
        <button type="button" class="button" (click)="stage.zoomOut()">Zoom out</button>
        <button type="button" class="button" (click)="stage.zoomIn()">Zoom in</button>
        <button type="button" class="button" (click)="stage.rotateViewBy(90)">Turn the view</button>
      </div>
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-form-layer>
            <!-- The first control that matches a box draws it; the layer draws every other
                 box. A checkbox as a switch: a click fills the field in, as a click on the
                 checkbox would. -->
            <ng-template [epdfFieldControl]="isCheckbox" let-widget let-setValue="setValue">
              @if (widget.control === 'toggle') {
                <button
                  type="button"
                  role="switch"
                  class="switch"
                  [attr.aria-checked]="widget.checked"
                  [attr.aria-label]="widget.label"
                  [disabled]="widget.disabled"
                  (click)="setValue({ checked: !widget.checked })"
                ></button>
              }
            </ng-template>
          </epdf-form-layer>
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly isCheckbox = (widget: FormWidgetItem) =>
    widget.control === 'toggle' && widget.kind === 'checkbox';
}
