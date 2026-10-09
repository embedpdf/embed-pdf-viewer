import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
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
  EpdfSelectionClipboard,
  EpdfSelectionLayer,
  EpdfSelectionMenu,
  withSelection,
} from '@embedpdf/angular/selection';
import { localEngine } from '@embedpdf/engine';

const PLACEMENTS = ['top', 'bottom', 'left', 'right'] as const;
type Placement = (typeof PLACEMENTS)[number];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// What's in the menu is yours: here, copy and clear.
@Component({
  selector: 'demo-selection-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="menu">
      @if (selection.canCopy()) {
        <button type="button" class="button" (click)="copy()">Copy</button>
      }
      <button type="button" class="button" (click)="selection.clear()">Clear</button>
    </div>
  `,
})
export class SelectionActions {
  protected readonly selection = inject(EpdfSelection);

  protected copy() {
    void copySelection(this.selection).catch(() => {
      // Show your product's clipboard error message here.
    });
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
    EpdfSelectionClipboard,
    SelectionActions,
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
  styleUrl: './menu.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <epdf-selection-clipboard />
      <div class="toolbar" role="group" aria-label="Where the menu goes">
        @for (name of placements; track name) {
          <button
            type="button"
            class="segment"
            [attr.aria-pressed]="placement() === name"
            (click)="placement.set(name)"
          >
            {{ name }}
          </button>
        }
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-selection-layer />
        </ng-template>
        <epdf-selection-menu [placement]="placement()" [gap]="8">
          <demo-selection-actions />
        </epdf-selection-menu>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly placements = PLACEMENTS;
  protected readonly placement = signal<Placement>('top');
  private readonly selection = inject(EpdfSelection);
  private readonly document = inject(EpdfDocument);

  constructor() {
    // Something selected on load, so the menu shows: the title on the cover.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (cover) this.selection.select({ page: cover, start: 10, count: 52 });
    });
  }
}
