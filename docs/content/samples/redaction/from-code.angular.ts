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
import { EpdfSelection, EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { withSearch } from '@embedpdf/angular/search';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfRedaction, withRedaction } from '@embedpdf/angular/redaction';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/** Next to `<epdf-stage #stage="epdfStage">`: `<demo-mark-from-code [stage]="stage" />`. */
@Component({
  selector: 'demo-mark-from-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <form class="query" (submit)="$event.preventDefault(); markMatches()">
        <input
          #field
          class="field"
          type="search"
          aria-label="Text to mark"
          [value]="text()"
          (input)="text.set(field.value)"
        />
        <button type="submit" class="button" [disabled]="!text().trim()">Every match</button>
      </form>
      <button
        type="button"
        class="button"
        [disabled]="!selection.hasSelection()"
        title="Select some text on the page first"
        (click)="redaction.markSelection()"
      >
        The selected text
      </button>
      <button type="button" class="button" (click)="markThisPage()">This page</button>
      <button
        type="button"
        class="button"
        [disabled]="!redaction.pendingCount()"
        (click)="redaction.clearPending()"
      >
        Remove all
      </button>
      <span class="spacer"></span>
      <output class="readout">{{ marks() }}</output>
    </div>
  `,
})
export class MarkFromCode {
  readonly stage = input.required<EpdfStage>();

  protected readonly redaction = inject(EpdfRedaction);
  protected readonly selection = inject(EpdfSelection);
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly text = signal('EmbedPDF');
  protected readonly marks = computed(() => {
    const count = this.redaction.pendingCount();
    return `${count} ${count === 1 ? 'mark' : 'marks'}`;
  });
  private started = false;

  constructor() {
    // On load: every "EmbedPDF" in the document.
    effect(() => {
      if (this.annotation.status() !== 'ready' || this.started) return;
      this.started = true;
      void this.redaction.markMatches({ text: 'EmbedPDF' });
    });
  }

  protected markMatches() {
    const text = this.text().trim();
    if (text) void this.redaction.markMatches({ text });
  }

  protected markThisPage() {
    void this.redaction.markPage(this.stage().currentPageIndex());
  }
}

// Marking matches runs a search; marking the selected text needs a selection.
@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    EpdfAnnotationLayer,
    MarkFromCode,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
      withSearch(),
      withAnnotation(),
      withRedaction(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './from-code.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-mark-from-code [stage]="stage" />
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
