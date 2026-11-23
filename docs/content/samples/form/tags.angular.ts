import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import type { FormField } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A tag beside the first box of a field: pinned, so it stays on the field. A pinned tag keeps
// its size at every zoom, so this one is small: it fits in the page's margin on a phone too.
@Component({
  selector: 'demo-tag',
  imports: [EpdfAnchored],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <epdf-anchored [anchor]="anchor()" placement="left" [gap]="6" pinned>
      <button
        type="button"
        class="tag"
        title="Required"
        [attr.aria-label]="'Required: ' + (field().alternateName ?? field().name)"
        (click)="form.focus(field().ref)"
      >
        !
      </button>
    </epdf-anchored>
  `,
})
export class Tag {
  readonly field = input.required<FormField>();

  protected readonly form = inject(EpdfForm);
  protected readonly anchor = this.form.widgetAnchorOf(
    () => this.form.getWidgets(this.field().ref)[0]?.ref ?? null,
  );
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer, Tag],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: forms }] },
      withStage(),
      withRender(),
      withInteraction(),
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tags.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <!-- The view's own controls: the tags follow the view when it zooms and turns. -->
      <div class="toolbar">
        <button type="button" class="button" (click)="stage.zoomOut()">Zoom out</button>
        <button type="button" class="button" (click)="stage.zoomIn()">Zoom in</button>
        <button type="button" class="button" (click)="stage.rotateViewBy(90)">Turn the view</button>
      </div>
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-form-layer />
        </ng-template>
        <!-- A tag on every required field that is still empty. -->
        @for (field of missing(); track field.name) {
          <demo-tag [field]="field" />
        }
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly form = inject(EpdfForm);

  protected readonly missing = computed(() => {
    this.form.fields(); // again when a field is filled in
    return this.form.validate().missing;
  });
}
