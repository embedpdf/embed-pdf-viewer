import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocumentGate,
  EpdfDocuments,
  provideEmbedPdf,
  saveFile,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfRedaction, withRedaction } from '@embedpdf/angular/redaction';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The cover's title, in page coordinates: the shapes drawn over it go with it.
const TITLE = { x: 100, y: 212, width: 392, height: 156 };

@Component({
  selector: 'demo-apply-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (asking()) {
      <div class="toolbar confirm" role="alertdialog" aria-label="Redact for good?">
        <span class="readout">{{ question() }}</span>
        <span class="spacer"></span>
        <button type="button" class="button" (click)="asking.set(false)">Cancel</button>
        <button
          type="button"
          class="button danger"
          [disabled]="redaction.applying()"
          (click)="redactForGood()"
        >
          Redact for good
        </button>
      </div>
    } @else {
      <div class="toolbar">
        <button
          type="button"
          class="button danger"
          [disabled]="!redaction.pendingCount() || !redaction.canApply()"
          (click)="ask()"
        >
          Redact…
        </button>
        <button
          type="button"
          class="button"
          [disabled]="!redaction.lastResult()"
          title="A fresh file, without the earlier revision that still holds the content"
          (click)="download()"
        >
          Download
        </button>
        <span class="spacer"></span>
        <output class="readout">
          @if (redaction.lastResult(); as result) {
            Gone for good, with {{ result.removedAnnotationCount }} other annotations
          } @else {
            {{ marks() }} waiting
          }
        </output>
      </div>
    }
  `,
})
export class ApplyBar {
  protected readonly redaction = inject(EpdfRedaction);
  private readonly documents = inject(EpdfDocuments);
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly asking = signal(false);
  protected readonly collateral = signal(0);
  protected readonly marks = computed(() => {
    const count = this.redaction.pendingCount();
    return `${count} ${count === 1 ? 'mark' : 'marks'}`;
  });
  protected readonly question = computed(() => {
    const count = this.collateral();
    const others =
      count > 0 ? `${count} ${count === 1 ? 'annotation' : 'annotations'} under them go too. ` : '';
    return `Redact ${this.marks()}? ${others}This can’t be undone.`;
  });
  private started = false;

  constructor() {
    // On load: the title marked.
    effect(() => {
      if (this.annotation.status() !== 'ready' || this.started) return;
      this.started = true;
      void this.redaction.markArea(0, TITLE);
    });
  }

  // The other annotations applying removes too: they could show what was there.
  protected ask() {
    this.collateral.set(this.redaction.estimateCollateral().count);
    this.asking.set(true);
  }

  protected redactForGood() {
    void this.redaction.applyAll().finally(() => this.asking.set(false));
  }

  protected download() {
    void this.documents
      .download(undefined, { mode: 'rewrite' })
      .then((bytes) => saveFile(bytes, 'redacted.pdf', 'application/pdf'));
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
    ApplyBar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withRedaction(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './apply.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-apply-bar />
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
