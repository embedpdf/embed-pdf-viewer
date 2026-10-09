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
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
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
  private readonly document = inject(EpdfDocument);
  private added = false;

  constructor() {
    // On load: a rectangle and a circle on the cover, both selected.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void Promise.all([
          this.annotation.create(cover, {
            subtype: 'square',
            box: { x: 300, y: 560, width: 140, height: 60 },
            color: '#e5484d',
            interiorColor: '#ffe4e1',
            strokeWidth: 3,
          }),
          this.annotation.create(cover, {
            subtype: 'circle',
            box: { x: 460, y: 550, width: 80, height: 80 },
            color: '#1e90ff',
            strokeWidth: 3,
          }),
        ]).then((created) => this.annotation.selection.set(created.map((c) => c.annotation.ref)));
      });
    });
  }
}
