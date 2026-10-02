import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfRedaction, withRedaction } from '@embedpdf/angular/redaction';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The cover's subtitle, in page coordinates.
const SUBTITLE = { x: 100, y: 378, width: 352, height: 114 };

/** Next to `<epdf-stage #stage="epdfStage">`: `<demo-label-bar [stage]="stage" />`. */
@Component({
  selector: 'demo-label-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <form class="label-form" (submit)="$event.preventDefault(); setLabel()">
        <input
          #field
          class="field"
          aria-label="Label"
          [value]="text()"
          [disabled]="!mark()"
          (input)="text.set(field.value)"
        />
        <button type="submit" class="button" [disabled]="!mark()">Set label</button>
      </form>
      <label class="label">
        <input
          #repeat
          type="checkbox"
          [checked]="mark()?.repeat ?? false"
          [disabled]="!mark()"
          (change)="setRepeat(repeat.checked)"
        />
        Repeat
      </label>
      <button
        type="button"
        class="button danger"
        [disabled]="!mark() || redaction.applying()"
        (click)="redaction.applyAll()"
      >
        Redact
      </button>
      <span class="spacer"></span>
      <output class="readout">
        {{
          redaction.lastResult() ? 'The label is part of the page now' : 'Redact to see the label'
        }}
      </output>
    </div>
  `,
})
export class LabelBar {
  readonly stage = input.required<EpdfStage>();

  protected readonly redaction = inject(EpdfRedaction);
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly mark = computed(() => this.redaction.pending()[0]);
  protected readonly text = signal('Classified');
  private started = false;

  constructor() {
    // On load: the subtitle marked, with a label that fills the area.
    effect(() => {
      if (this.annotation.status() !== 'ready' || this.started) return;
      this.started = true;
      const stage = this.stage();
      void this.redaction
        .markArea(0, SUBTITLE)
        .then(({ mark }) =>
          this.redaction.updateLabel(mark.ref, { overlayText: 'Classified', repeat: true }),
        )
        .then(() => stage.reveal(0, { rect: SUBTITLE }));
    });
  }

  protected setLabel() {
    const mark = this.mark();
    if (mark)
      void this.redaction.updateLabel(mark.ref, { overlayText: this.text().trim() || null });
  }

  protected setRepeat(repeat: boolean) {
    const mark = this.mark();
    if (mark) void this.redaction.updateLabel(mark.ref, { repeat });
  }
}

// What applying paints over every mark: a dark blue area, its label in white.
@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    LabelBar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withRedaction({ overlay: { fill: '#1a2748', text: { color: '#ffffff' } } }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './label.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-label-bar [stage]="stage" />
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer [annotations]="false" />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
