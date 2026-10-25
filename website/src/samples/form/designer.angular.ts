import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

const registration = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-registration.pdf');
  return { kind: 'bytes', id: 'registration', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const FIELD_TOOLS = [
  ['form-text', 'Text'],
  ['form-checkbox', 'Checkbox'],
  ['form-radio', 'Radio button'],
  ['form-combobox', 'Dropdown'],
  ['form-listbox', 'List'],
  ['form-signature', 'Signature'],
] as const;

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
      { engine: () => localEngine(), initialDocuments: [{ source: registration }] },
      withStage(),
      withRender(),
      withInteraction(),
      // Building forms needs the annotation plugin: in design mode, fields are boxes like any annotation.
      withAnnotation(),
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './designer.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      @if (!form.canDesign()) {
        <p class="readout">This document's form can't be changed.</p>
      } @else {
        <div class="toolbar">
          <div class="segments">
            <button
              type="button"
              class="segment"
              [attr.aria-pressed]="filling()"
              (click)="interaction.activateTool('pointer')"
            >
              Fill in
            </button>
            <button
              type="button"
              class="segment"
              [attr.aria-pressed]="!filling()"
              (click)="interaction.activateTool('form-edit')"
            >
              Design
            </button>
          </div>
          @for (tool of tools; track tool[0]) {
            <button
              type="button"
              class="button"
              [attr.aria-pressed]="interaction.activeToolId() === tool[0]"
              (click)="interaction.activateTool(tool[0])"
            >
              {{ tool[1] }}
            </button>
          }
          <output class="readout">
            {{ form.fields().length }} fields: click the page to place another
          </output>
        </div>
      }
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer />
          <epdf-form-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly form = inject(EpdfForm);
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly tools = FIELD_TOOLS;
  private readonly document = inject(EpdfDocument);
  private started = false;

  /** The pointer fills the form in; every other tool here designs it. */
  protected readonly filling = computed(() => this.interaction.activeToolId() === 'pointer');

  constructor() {
    // Start with the text tool picked: the printed form has boxes, but no fields yet.
    effect(() => {
      if (this.document.status() !== 'ready' || this.started) return;
      this.started = true;
      untracked(() => this.interaction.activateTool('form-text'));
    });
  }
}
