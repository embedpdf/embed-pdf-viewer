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
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source layout]
const layout = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/layout.pdf');
  return { kind: 'bytes', id: 'layout', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-turn-and-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button
        type="button"
        class="button"
        [disabled]="nothing()"
        (click)="annotation.selection.rotateBy(-90)"
      >
        ↺ Turn left
      </button>
      <button
        type="button"
        class="button"
        [disabled]="nothing()"
        (click)="annotation.selection.rotateBy(90)"
      >
        ↻ Turn right
      </button>
      <button
        type="button"
        class="button"
        [disabled]="nothing()"
        (click)="annotation.selection.resetRotation()"
      >
        Upright
      </button>
      <span class="spacer"></span>
      <button
        type="button"
        class="button"
        [disabled]="!annotation.selection.canGroup()"
        (click)="annotation.selection.group()"
      >
        Group
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!annotation.selection.canUngroup()"
        (click)="annotation.selection.ungroup()"
      >
        Ungroup
      </button>
    </div>
  `,
})
export class TurnAndGroup {
  protected readonly annotation = inject(EpdfAnnotation);
  // A signal, read on every selection change, so the buttons follow what's selected (the
  // checks in the template too).
  protected readonly nothing = computed(() => this.annotation.selected().length === 0);
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    TurnAndGroup,
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
  styleUrl: './turn-group.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-turn-and-group />
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
  private readonly stage = viewChild(EpdfStage);
  private done = false;

  constructor() {
    // On load: the document's square and circle, both selected.
    effect(() => {
      const stage = this.stage();
      if (!stage || this.annotation.status() !== 'ready' || this.done) return;
      this.done = true;
      untracked(() => {
        const found = this.annotation
          .list()
          .filter((each) => each.nm === 'square' || each.nm === 'circle');
        if (found.length === 0) return;
        this.annotation.selection.set(found.map((each) => each.ref));
        stage.reveal(found[0].page, { rect: found[0].rect });
      });
    });
  }
}
