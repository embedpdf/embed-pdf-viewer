import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const TOOLS = [
  { id: 'square', label: 'Rectangle', hint: 'A click makes 120 × 80 points' },
  { id: 'arrow', label: 'Arrow', hint: 'A click points an arrow down at it' },
  { id: 'circle', label: 'Circle', hint: 'Drag only: a click does nothing' },
];

@Component({
  selector: 'demo-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Tool">
        @for (tool of tools; track tool.id) {
          <button
            type="button"
            [attr.aria-pressed]="interaction.activeToolId() === tool.id"
            (click)="interaction.activateTool(tool.id)"
          >
            {{ tool.label }}
          </button>
        }
      </div>
      <p class="hint">{{ active()?.hint ?? 'Pick a tool, then click the page' }}</p>
    </div>
  `,
})
export class Toolbar {
  protected readonly tools = TOOLS;
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly active = computed(() =>
    TOOLS.find((tool) => tool.id === this.interaction.activeToolId()),
  );

  constructor() {
    // The rectangle tool is active on load: click the page.
    this.interaction.activateTool('square');
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
      // What one click makes: a 120 × 80 rectangle, an arrow pointing down at the click, and no circle.
      withAnnotation({
        tools: [
          { id: 'square', clickCreate: { width: 120, height: 80 } },
          {
            id: 'arrow',
            extends: 'line',
            defaults: { lineEndings: { start: 'none', end: 'closed-arrow' } },
            clickCreate: { length: 80, rotation: 90, anchor: 'end' },
          },
          { id: 'circle', clickCreate: false }, // drag only
        ],
      }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './click-create.css',
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
