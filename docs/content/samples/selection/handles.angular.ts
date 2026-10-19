import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  copySelection,
  EpdfSelection,
  EpdfSelectionHandles,
  EpdfSelectionLayer,
  EpdfSelectionMenu,
  withSelection,
} from '@embedpdf/angular/selection';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-copy-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="button" [disabled]="!selection.canCopy()" (click)="copy()">
      Copy
    </button>
  `,
})
export class CopyButton {
  protected readonly selection = inject(EpdfSelection);

  protected copy() {
    void copySelection(this.selection).catch(() => {});
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    EpdfSelectionMenu,
    EpdfSelectionHandles,
    CopyButton,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './handles.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <epdf-stage *epdfDocumentGate="let document; fallback: loading" class="stage">
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-selection-layer />
      </ng-template>
      <!-- Clear of the start handle's grip, which sits above the first line. -->
      <epdf-selection-menu [gap]="20">
        <demo-copy-button />
      </epdf-selection-menu>
      <epdf-selection-handles />
    </epdf-stage>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly selection = inject(EpdfSelection);
  private readonly document = inject(EpdfDocument);

  constructor() {
    // A word selected on load, as a long-press selects one: "Viewers", on the cover.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (cover) this.selection.select({ page: cover, start: 14, count: 7 });
    });
  }
}
