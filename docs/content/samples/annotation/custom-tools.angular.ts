import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import type { AnnotationTool } from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A toolbar that builds itself from the tools: every tool with a label gets a button.
@Component({
  selector: 'demo-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Tool">
        <button
          type="button"
          [attr.aria-pressed]="interaction.activeToolId() === 'pointer'"
          (click)="interaction.activateTool('pointer')"
        >
          Select
        </button>
        @for (tool of labelled; track tool.id) {
          <button
            type="button"
            [attr.aria-pressed]="interaction.activeToolId() === tool.id"
            (click)="interaction.activateTool(tool.id)"
          >
            {{ label(tool) }}
          </button>
        }
      </div>
    </div>
  `,
})
export class Toolbar {
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly labelled = this.annotation.tools
    .list()
    .filter((tool) => typeof tool.meta?.label === 'string');

  constructor() {
    // On load: the arrow tool is active.
    this.interaction.activateTool('arrow');
  }

  protected label(tool: AnnotationTool) {
    return String(tool.meta?.label);
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    Toolbar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: review }] },
      withStage(),
      withRender(),
      withInteraction(),
      // A blue pen, an arrow, and three tools of your own. `meta` is yours: the toolbar reads its label.
      withAnnotation({
        tools: [
          {
            id: 'ink',
            defaults: { color: '#1e90ff', strokeWidth: 3 },
            meta: { label: 'Blue pen' },
          },
          {
            id: 'arrow',
            extends: 'line',
            defaults: { lineEndings: { start: 'none', end: 'closed-arrow' } },
            meta: { label: 'Arrow' },
          },
          {
            id: 'red-pen',
            extends: 'ink',
            defaults: { color: '#ff0000', strokeWidth: 2 },
            meta: { label: 'Red pen' },
          },
          {
            id: 'marker',
            extends: 'ink-highlight',
            defaults: { color: '#ffa500' },
            meta: { label: 'Marker' },
          },
          {
            id: 'todo',
            extends: 'note',
            defaults: { icon: 'key', contents: 'TODO' },
            meta: { label: 'To do' },
          },
        ],
      }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './custom-tools.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-toolbar />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
