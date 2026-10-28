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
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

const layout = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/layout.pdf');
  return { kind: 'bytes', id: 'layout', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The top half of a page, where the box selects: on the home page, the image and the button.
const TOP_HALF = { x: 0, y: 0, width: 612, height: 396 };

@Component({
  selector: 'demo-selection-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button type="button" class="button" [disabled]="!page()" (click)="selectAll()">
        Everything on the page
      </button>
      <button type="button" class="button" [disabled]="!page()" (click)="selectTopHalf()">
        The top half
      </button>
      <button
        type="button"
        class="button"
        [disabled]="selected().length === 0"
        (click)="annotation.selection.clear()"
      >
        Clear
      </button>
      <span class="spacer"></span>
      <output class="readout">{{ selected().length }} selected</output>
    </div>
  `,
})
export class SelectionToolbar {
  protected readonly annotation = inject(EpdfAnnotation);
  private readonly document = inject(EpdfDocument);
  protected readonly selected = this.annotation.selected; // the selected annotations
  protected readonly page = computed(() => this.document.pages()[0]?.ref); // the home page wireframe

  protected selectAll() {
    const page = this.page();
    if (page) this.annotation.selection.selectAll(page);
  }

  protected selectTopHalf() {
    const page = this.page();
    if (page) this.annotation.selection.selectInRect(page, TOP_HALF);
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
    SelectionToolbar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: layout }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './select-code.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-selection-toolbar />
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
export class App {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private done = false;

  constructor() {
    // On load: the home page wireframe, with everything on it selected.
    effect(() => {
      const page = this.document.pages()[0]?.ref;
      const stage = this.stage();
      if (this.annotation.status() !== 'ready' || !page || !stage || this.done) return;
      this.done = true;
      untracked(() => {
        this.annotation.selection.selectAll(page);
        stage.goToPage(page);
      });
    });
  }
}
