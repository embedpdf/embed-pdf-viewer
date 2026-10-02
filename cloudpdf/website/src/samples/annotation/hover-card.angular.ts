import {
  ChangeDetectionStrategy,
  Component,
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
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// A card next to the annotation under the pointer: who wrote it, and what.
@Component({
  selector: 'demo-hover-card',
  imports: [EpdfAnchored],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (hovered(); as hovered) {
      @if (hovered.contents) {
        <epdf-anchored [anchor]="anchor()" placement="top">
          <div class="card">
            <strong>{{ hovered.author ?? 'Someone' }}</strong>
            <p>{{ hovered.contents }}</p>
          </div>
        </epdf-anchored>
      }
    }
  `,
})
export class HoverCard {
  private readonly annotation = inject(EpdfAnnotation);

  protected readonly hovered = this.annotation.hovered; // the annotation under the pointer, or null
  protected readonly anchor = this.annotation.anchorOf(() => this.hovered()?.ref ?? null);
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    HoverCard,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }),
        identity: { userId: 'u_381', displayName: 'Dana Smith' },
        initialDocuments: [{ source: ebook }],
      },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './hover-card.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <p class="hint">Point at a note or the green rectangle</p>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer [annotations]="false" />
          <epdf-annotation-layer />
        </ng-template>
        <demo-hover-card />
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
    // On load: two notes and a rectangle on the cover, each with a comment.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void this.annotation.create(cover, {
          subtype: 'text',
          rect: { x: 470, y: 232, width: 20, height: 20 },
          contents: 'Can we shorten the title?',
          color: '#facc15',
        });
        void this.annotation.create(cover, {
          subtype: 'text',
          rect: { x: 280, y: 520, width: 20, height: 20 },
          contents: 'Add the co-author',
          color: '#facc15',
        });
        void this.annotation.create(cover, {
          subtype: 'square',
          box: { x: 96, y: 376, width: 360, height: 118 },
          contents: 'This subtitle reads well',
          color: '#30a46c',
          strokeWidth: 3,
        });
      });
    });
  }
}
