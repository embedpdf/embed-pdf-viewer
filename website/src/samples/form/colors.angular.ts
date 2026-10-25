import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const COLORS = [
  ['Accent', null],
  ['Orange', '#ea580c'],
  ['Green', '#16a34a'],
] as const;

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: forms }] },
      withStage(),
      withRender(),
      withInteraction(),
      // The colors the viewer draws around fields; `null` follows the viewer's accent.
      withForm({ fields: { border: '#ea580c' } }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './colors.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <span class="label">Edges</span>
        <div class="segments">
          @for (color of colors; track color[0]) {
            <button
              type="button"
              class="segment"
              [attr.aria-pressed]="form.settings().fields.border === color[1]"
              (click)="form.updateSettings({ fields: { border: color[1] } })"
            >
              {{ color[0] }}
            </button>
          }
        </div>
        <span class="label">Focus</span>
        <div class="segments">
          @for (color of colors; track color[0]) {
            <button
              type="button"
              class="segment"
              [attr.aria-pressed]="form.settings().focus.color === color[1]"
              (click)="form.updateSettings({ focus: { color: color[1] } })"
            >
              {{ color[0] }}
            </button>
          }
        </div>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-form-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly form = inject(EpdfForm);
  protected readonly colors = COLORS;
}
