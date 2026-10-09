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
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import type { FormFieldDTO } from '@embedpdf/angular/form';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    EpdfFormLayer,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './field-settings.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="viewer">
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-annotation-layer />
            <epdf-form-layer />
          </ng-template>
        </epdf-stage>
        <!-- What a settings panel shows for the selected field, and changes with update(). -->
        @if (form.selectedField(); as field) {
          <div class="panel">
            <label class="setting">
              Name
              <input #name class="input" [value]="field.name" (blur)="rename(field, name.value)" />
            </label>
            <label class="setting">
              Tooltip
              <input
                #tooltip
                class="input"
                [value]="field.alternateName ?? ''"
                (blur)="form.update(field.ref, { alternateName: tooltip.value || null })"
              />
            </label>
            <label class="check">
              <input
                #required
                type="checkbox"
                [checked]="field.required"
                (change)="form.update(field.ref, { required: required.checked })"
              />
              Required
            </label>
            <label class="check">
              <input
                #readOnly
                type="checkbox"
                [checked]="field.readOnly"
                (change)="form.update(field.ref, { readOnly: readOnly.checked })"
              />
              Read-only
            </label>
            <button type="button" class="button" (click)="form.delete(field.ref)">
              Remove the field
            </button>
          </div>
        } @else {
          <p class="panel hint">Select a field on the page.</p>
        }
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly form = inject(EpdfForm);
  private readonly annotation = inject(EpdfAnnotation);
  private readonly interaction = inject(EpdfInteraction);
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private added = false;

  constructor() {
    // The ebook has no form: add two fields to its last page, and select the first in design mode.
    effect(() => {
      const page = this.document.pages().at(-1)?.ref;
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !page || !stage || this.added) return;
      this.added = true;
      untracked(() => void this.designForm(page, stage));
    });
  }

  protected rename(field: FormFieldDTO, value: string) {
    const name = value.trim();
    if (name && name !== field.name) void this.form.update(field.ref, { name });
  }

  private async designForm(page: PageRef, stage: EpdfStage) {
    const at = (y: number) => ({ page, rect: { x: 72, y, width: 240, height: 24 }, ...look });
    const { field } = await this.form.create({ family: 'text', name: 'name', widgets: [at(540)] });
    await this.form.create({ family: 'text', name: 'email', widgets: [at(576)] });
    stage.goToPage(page);
    this.interaction.activateTool('form-edit');
    const widget = field.widgets[0]?.ref;
    if (widget) this.annotation.selection.set([widget]);
  }
}
