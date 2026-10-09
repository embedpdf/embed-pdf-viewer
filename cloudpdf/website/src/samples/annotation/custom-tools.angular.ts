import {
  ChangeDetectionStrategy,
  Component,
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
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import type { AnnotationTool } from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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
  private readonly document = inject(EpdfDocument);
  protected readonly labelled = this.annotation.tools
    .list()
    .filter((tool) => typeof tool.meta?.label === 'string');
  private added = false;

  constructor() {
    // On load: an arrow drawn with the arrow tool's defaults, and the arrow tool active.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void this.annotation.create(
          cover,
          { subtype: 'line', linePoints: { start: { x: 520, y: 120 }, end: { x: 470, y: 230 } } },
          undefined,
          { tool: 'arrow' },
        );
        this.interaction.activateTool('arrow');
      });
    });
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
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
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
