import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfFieldControlTemplate,
  EpdfForm,
  EpdfFormLayer,
  withForm,
} from '@embedpdf/angular/form';
import type { EpdfFieldControlTemplateContext, FormWidgetItem } from '@embedpdf/angular/form';
import { cloudEngine } from '@cloudpdf/engine';

const forms: OpenInput = { kind: 'grant', grant: 'shr_eBRW5E3MpolzD8G36Alp30EF' };

@Component({
  selector: 'demo-root',
  imports: [
    NgTemplateOutlet,
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
  styleUrl: './clear-button.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button type="button" class="button" (click)="fillIn()">Fill in</button>
        <button type="button" class="button" (click)="stage.zoomIn()">Zoom in</button>
        <button type="button" class="button" (click)="stage.rotateViewBy(90)">Turn the view</button>
      </div>
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-form-layer>
            <!-- The one-line text boxes get a button at their end that empties them; the
                 layer draws every other box. The outlet draws the layer's own text box: the
                 field as the PDF draws it, and the editor people type in. The button is
                 yours. -->
            <ng-template
              [epdfFieldControl]="isTextBox"
              let-widget
              let-native="native"
              let-setValue="setValue"
            >
              <ng-container [ngTemplateOutlet]="native" />
              @if (widget.control === 'text' && !widget.disabled && widget.value !== '') {
                <!-- Tab goes to the text box. -->
                <button
                  type="button"
                  class="clear-button"
                  [attr.aria-label]="'Clear ' + widget.label"
                  tabindex="-1"
                  (click)="clear(widget, setValue)"
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
  private readonly form = inject(EpdfForm);

  protected readonly isTextBox = (widget: FormWidgetItem) =>
    widget.control === 'text' && !widget.multiline;

  /** Empty the box, then put the cursor back in it, ready for the new value. */
  protected clear(widget: FormWidgetItem, setValue: EpdfFieldControlTemplateContext['setValue']) {
    void setValue({ value: '' }).then(() => this.form.focus(widget.fieldRef));
  }

  protected fillIn() {
    void this.form.importValues({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      company: 'Lanternfield',
    });
  }
}
