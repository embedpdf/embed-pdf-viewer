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
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  EpdfAnnotationMenu,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const notice: OpenInput = { kind: 'grant', grant: 'shr_LfeeUer1ogBI9mz8eYkWXa0d' };

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
    EpdfSelectionLayer,
    EpdfAnnotationLayer,
    EpdfAnnotationMenu,
    SelectionActions,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine(), initialDocuments: [{ source: notice }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
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
          <epdf-selection-layer />
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
  private readonly stage = viewChild(EpdfStage);
  private done = false;

  constructor() {
    // On load: the document's text box, selected, so its menu shows.
    effect(() => {
      const stage = this.stage();
      if (!stage || this.annotation.status() !== 'ready' || this.done) return;
      this.done = true;
      untracked(() => {
        const textBox = this.annotation.list().find((each) => each.nm === 'text-box');
        if (!textBox) return;
        this.annotation.selection.set([textBox.ref]);
        stage.reveal(textBox.page, { rect: textBox.rect });
      });
    });
  }
}
