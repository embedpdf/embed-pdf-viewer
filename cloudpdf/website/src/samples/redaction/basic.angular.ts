import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfRedaction, withRedaction } from '@embedpdf/angular/redaction';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The author's name on the cover, in page coordinates.
const AUTHOR = { x: 100, y: 508, width: 172, height: 50 };

/** Next to `<epdf-stage #stage="epdfStage">`: `<demo-redact-bar [stage]="stage" />`. */
@Component({
  selector: 'demo-redact-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button
        type="button"
        class="button"
        [attr.aria-pressed]="marking()"
        (click)="interaction.activateTool(marking() ? 'pointer' : 'redact')"
      >
        Mark for redaction
      </button>
      <button
        type="button"
        class="button danger"
        [disabled]="!redaction.pendingCount() || redaction.applying()"
        (click)="redaction.applyAll()"
      >
        Redact {{ redaction.pendingCount() }}
        {{ redaction.pendingCount() === 1 ? 'mark' : 'marks' }}
      </button>
      <span class="spacer"></span>
      <output class="readout">
        {{ marking() ? 'Select text, or drag over an area' : 'Click a mark to move it' }}
      </output>
    </div>
  `,
})
export class RedactBar {
  readonly stage = input.required<EpdfStage>();

  protected readonly interaction = inject(EpdfInteraction);
  protected readonly redaction = inject(EpdfRedaction);
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly marking = computed(() => this.interaction.activeToolId() === 'redact');
  private started = false;

  constructor() {
    // On load: the author's name marked, and the redact tool on.
    effect(() => {
      if (this.annotation.status() !== 'ready' || this.started) return;
      this.started = true;
      const stage = this.stage();
      void this.redaction.markArea(0, AUTHOR).then(() => stage.reveal(0, { rect: AUTHOR }));
      this.interaction.activateTool('redact');
    });
  }
}

// The selection plugin lets the redact tool mark the text you select.
@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    EpdfAnnotationLayer,
    RedactBar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
      withAnnotation(),
      withRedaction(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-redact-bar [stage]="stage" />
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-selection-layer />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
