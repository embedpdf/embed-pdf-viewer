import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
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

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

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
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
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
            @if (form.fields().length === 0) {
              Click the page to place a field
            } @else {
              {{ form.fields().length }} fields
            }
          </output>
        </div>
      }
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer [annotations]="false" />
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
  private readonly stage = viewChild(EpdfStage);
  private started = false;

  /** The pointer fills the form in; every other tool here designs it. */
  protected readonly filling = computed(() => this.interaction.activeToolId() === 'pointer');

  constructor() {
    // Start on the ebook's last page, which has room for a form, with the text tool picked.
    effect(() => {
      const page = this.document.pages().at(-1)?.ref;
      const stage = this.stage();
      if (!page || !stage || this.started) return;
      this.started = true;
      untracked(() => {
        stage.goToPage(page);
        this.interaction.activateTool('form-text');
      });
    });
  }
}
