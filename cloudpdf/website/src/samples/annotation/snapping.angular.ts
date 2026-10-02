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
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
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
          <epdf-render-layer [annotations]="false" />
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
  private added = false;

  constructor() {
    // On load: two rectangles on the cover, the right one selected. Drag it next to the other.
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
            subtype: 'square',
            box: { x: 340, y: 560, width: 120, height: 80 },
            color: '#e5484d',
            strokeWidth: 3,
          },
          undefined,
          { select: true },
        );
      });
    });
  }
}
