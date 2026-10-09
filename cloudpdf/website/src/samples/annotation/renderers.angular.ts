import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
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
  EpdfAnnotationTemplate,
  withAnnotation,
  type Annotation,
} from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    EpdfAnnotationTemplate,
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
  styleUrl: './renderers.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Look">
          <button type="button" [attr.aria-pressed]="mine()" (click)="mine.set(true)">
            Your look
          </button>
          <button type="button" [attr.aria-pressed]="!mine()" (click)="mine.set(false)">
            The PDF's look
          </button>
        </div>
        <!-- A note keeps its size on screen and stays upright: turn the view to see it. -->
        <button type="button" class="button" (click)="stage.rotateViewBy(90)">Turn the view</button>
      </div>
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer>
            @if (mine()) {
              <!-- A note drawn as your app's comment bubble, the author's initials in it. It
                   fills its frame, so the selection outline and the click area match it, and
                   it turns with the annotation: a note stays upright on a turned page. -->
              <ng-template [epdfAnnotation]="isNote" let-annotation let-hovered="hovered">
                <div class="bubble" [class.bubble--hover]="hovered">{{ initials(annotation) }}</div>
              </ng-template>
            }
          </epdf-annotation-layer>
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

  protected readonly mine = signal(true);
  // Kept in a field, the same function on every page: the layer registers each look once.
  protected readonly isNote = (annotation: Annotation) => annotation.subtype === 'text';

  protected initials(annotation: Annotation) {
    return (annotation.author ?? '?')
      .split(' ')
      .map((word) => word[0])
      .join('');
  }

  constructor() {
    // On load: two notes on the cover, 24 points square: 32 pixels at 100%.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void this.annotation.create(cover, {
          subtype: 'text',
          rect: { x: 470, y: 228, width: 24, height: 24 },
          contents: 'Can we shorten the title?',
          color: '#facc15',
        });
        void this.annotation.create(cover, {
          subtype: 'text',
          rect: { x: 280, y: 516, width: 24, height: 24 },
          contents: 'Add the co-author',
          color: '#facc15',
        });
      });
    });
  }
}
