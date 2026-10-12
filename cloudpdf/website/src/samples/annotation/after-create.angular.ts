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
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'demo-after-drawing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button
        type="button"
        class="button"
        [attr.aria-pressed]="interaction.activeToolId() === 'square'"
        (click)="interaction.activateTool('square')"
      >
        Rectangle
      </button>
      <label class="check">
        <input
          #select
          type="checkbox"
          [checked]="afterCreate().select"
          (change)="annotation.updateSettings({ afterCreate: { select: select.checked } })"
        />
        Select it
      </label>
      <label class="check">
        <input
          #stay
          type="checkbox"
          [checked]="afterCreate().tool === 'stay'"
          (change)="
            annotation.updateSettings({ afterCreate: { tool: stay.checked ? 'stay' : 'default' } })
          "
        />
        Keep the tool
      </label>
      <button type="button" class="button" (click)="annotation.resetSettings()">Reset</button>
      <span class="spacer"></span>
      <output class="readout">
        {{ interaction.activeToolId() === 'square' ? 'Drawing' : 'Selecting' }}
      </output>
    </div>
  `,
})
export class AfterDrawing {
  protected readonly annotation = inject(EpdfAnnotation);
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly afterCreate = computed(() => this.annotation.settings().afterCreate);

  constructor() {
    // The rectangle tool is active on load.
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
    AfterDrawing,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './after-create.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-after-drawing />
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
