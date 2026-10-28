import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { EpdfForm, EpdfFormLayer, toFieldRef, withForm } from '@embedpdf/angular/form';
import type { FormFieldDTO } from '@embedpdf/angular/form';
import { cloudEngine } from '@cloudpdf/engine';

const forms: OpenInput = { kind: 'share', shareToken: 'shr_eBRW5E3MpolzD8G36Alp30EF' };

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
      { engine: () => cloudEngine(), initialDocuments: [{ source: forms }] },
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
  private started = false;

  constructor() {
    // On load: design mode, with the name field selected.
    effect(() => {
      if (this.form.status() !== 'ready' || this.started) return;
      this.started = true;
      untracked(() => {
        this.interaction.activateTool('form-edit');
        const widget = this.form.get(toFieldRef('name'))?.widgets[0]?.ref;
        if (widget) this.annotation.selection.set([widget]);
      });
    });
  }

  protected rename(field: FormFieldDTO, value: string) {
    const name = value.trim();
    if (name && name !== field.name) void this.form.update(field.ref, { name });
  }
}
