import { ChangeDetectionStrategy, Component, signal, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfAnnotationLayer,
  EpdfAnnotationTemplate,
  withAnnotation,
  type Annotation,
} from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source proposal]
const proposal = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-proposal.pdf');
  return { kind: 'bytes', id: 'proposal', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    EpdfAnnotationLayer,
    EpdfAnnotationTemplate,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
        identity: { userId: 'u_381', displayName: 'Dana Smith' },
        initialDocuments: [{ source: proposal }],
      },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
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
          <epdf-selection-layer />
          <epdf-annotation-layer>
            @if (mine()) {
              <!-- A note drawn as your app's comment bubble, the author's initials in it and
                   its text in the tooltip. It fills its frame, so the selection outline and
                   the click area match it, and it turns with the annotation: a note stays
                   upright on a turned page. -->
              <ng-template [epdfAnnotation]="isNote" let-annotation let-hovered="hovered">
                <div
                  class="bubble"
                  [class.bubble--hover]="hovered"
                  [title]="annotation.contents ?? ''"
                >
                  {{ initials(annotation) }}
                </div>
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
  protected readonly mine = signal(true);
  // Kept in a field, the same function on every page: the layer registers each look once.
  protected readonly isNote = (annotation: Annotation) => annotation.subtype === 'text';

  protected initials(annotation: Annotation) {
    return (annotation.author ?? '?')
      .split(' ')
      .map((word) => word[0])
      .join('');
  }
}
