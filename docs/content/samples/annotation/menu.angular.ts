import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  EpdfAnnotationMenu,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// What's in the menu depends on what's selected: text boxes get Bold and Edit.
@Component({
  selector: 'demo-selection-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="menu" role="toolbar" aria-label="Selection">
      @if (allText()) {
        <button type="button" (click)="annotation.text.toggleFormat('bold')">Bold</button>
      }
      @if (allText() && selected().length === 1) {
        <button type="button" (click)="edit()">Edit text</button>
      }
      <button type="button" (click)="annotation.selection.update({ color: '#dc143c' })">Red</button>
      <button type="button" (click)="annotation.selection.delete()">Delete</button>
    </div>
  `,
})
export class SelectionActions {
  protected readonly annotation = inject(EpdfAnnotation);
  protected readonly selected = this.annotation.selected;
  protected readonly allText = computed(() =>
    this.selected().every((a) => a.subtype === 'free-text'),
  );

  protected edit() {
    const [first] = this.selected();
    if (first) this.annotation.text.begin(first.ref);
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
    EpdfAnnotationMenu,
    SelectionActions,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './menu.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer />
        </ng-template>
        <epdf-annotation-menu placement="bottom">
          <demo-selection-actions />
        </epdf-annotation-menu>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly document = inject(EpdfDocument);
  private added = false;

  constructor() {
    // On load: a rectangle and a text box on the cover, the text box selected so the menu shows.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void this.annotation.create(cover, {
          subtype: 'square',
          box: { x: 96, y: 506, width: 178, height: 54 },
          color: '#1e90ff',
          strokeWidth: 3,
        });
        void this.annotation.create(
          cover,
          {
            subtype: 'free-text',
            box: { x: 300, y: 512, width: 230, height: 40 },
            contents: 'Ready for review',
            fontSize: 16,
            fontColor: '#1a2748',
            interiorColor: '#fffbe6',
          },
          undefined,
          { select: true },
        );
      });
    });
  }
}
