import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
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
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private added = false;

  constructor() {
    // The ebook has no form, so this adds one to its last page: fields with no border of their own.
    effect(() => {
      const page = this.document.pages().at(-1)?.ref;
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !page || !stage || this.added) return;
      this.added = true;
      untracked(() => void this.addSignUpForm(page, stage));
    });
  }

  private async addSignUpForm(page: PageRef, stage: EpdfStage) {
    const at = (y: number, width = 240, height = 24) => ({ page, rect: { x: 72, y, width, height } });
    await this.form.create({ family: 'text', name: 'name', widgets: [{ ...at(540), fontSize: 11 }] });
    await this.form.create({ family: 'text', name: 'email', widgets: [{ ...at(576), fontSize: 11 }] });
    await this.form.create({ family: 'checkbox', name: 'updates', widgets: [at(614, 16, 16)] });
    stage.goToPage(page);
  }
}
