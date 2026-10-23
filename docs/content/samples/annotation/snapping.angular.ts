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
  const response = await fetch('/pdfs/embedpdf-layout.pdf');
  return { kind: 'bytes', id: 'layout', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const QUARTERS = [0, 90, 180, 270];
const EIGHTHS = [0, 45, 90, 135, 180, 225, 270, 315];

@Component({
  selector: 'demo-snap-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <label class="check">
        <input
          #alignment
          type="checkbox"
          [checked]="snap().alignment"
          (change)="annotation.updateSettings({ snap: { alignment: alignment.checked } })"
        />
        Snap to other annotations
      </label>
      <label class="check">
        <input
          #eighths
          type="checkbox"
          [checked]="everyEighth()"
          (change)="snapTurns(eighths.checked)"
        />
        Turns snap every 45°
      </label>
      <p class="hint">Hold Shift to move or turn freely</p>
    </div>
  `,
})
export class SnapControls {
  protected readonly annotation = inject(EpdfAnnotation);
  protected readonly snap = computed(() => this.annotation.settings().snap);
  protected readonly everyEighth = computed(
    () => this.snap().rotationAngles.length === EIGHTHS.length,
  );

  protected snapTurns(everyEighth: boolean) {
    this.annotation.updateSettings({ snap: { rotationAngles: everyEighth ? EIGHTHS : QUARTERS } });
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
    SnapControls,
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
  styleUrl: './snapping.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-snap-controls />
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
    // On load: the document's circle, selected. Drag it toward the square to see it snap.
    effect(() => {
      const stage = this.stage();
      if (!stage || this.annotation.status() !== 'ready' || this.done) return;
      this.done = true;
      untracked(() => {
        const circle = this.annotation.list().find((each) => each.nm === 'circle');
        if (!circle) return;
        this.annotation.selection.set([circle.ref]);
        stage.reveal(circle.page, { rect: circle.rect });
      });
    });
  }
}
