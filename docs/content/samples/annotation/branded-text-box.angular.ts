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
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  EpdfAnnotationTemplate,
  EpdfRichTextEditor,
  withAnnotation,
  type Annotation,
} from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const FORMATS = ['bold', 'italic', 'underline'] as const;

// The formatting calls work on your element as they do on the built-in one.
@Component({
  selector: 'demo-format-buttons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      @for (format of formats; track format) {
        <button
          type="button"
          [class]="'button ' + format"
          [disabled]="!hasText()"
          (click)="annotation.text.toggleFormat(format)"
        >
          {{ format[0]!.toUpperCase() }}
        </button>
      }
    </div>
  `,
})
export class FormatButtons {
  protected readonly annotation = inject(EpdfAnnotation);
  protected readonly formats = FORMATS;
  protected readonly hasText = computed(() =>
    this.annotation.selected().some((selected) => selected.subtype === 'free-text'),
  );
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    EpdfAnnotationTemplate,
    EpdfRichTextEditor,
    FormatButtons,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: review }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './branded-text-box.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-format-buttons />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer>
            <!-- Your own text box, in your app's look: it fills its frame, which the layer
                 places and turns like the text box. The element inside is the editor and
                 fills the box, so the box draws the fill, border and padding. -->
            <ng-template [epdfAnnotation]="isTextBox" let-annotation>
              <div class="text-box" [class.editing]="editor.editing()">
                <div [epdfRichTextEditor]="annotation" #editor="epdfRichTextEditor"></div>
              </div>
            </ng-template>
          </epdf-annotation-layer>
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

  // Kept in a field, the same function on every page: the layer registers the look once.
  protected readonly isTextBox = (annotation: Annotation) => annotation.subtype === 'free-text';

  constructor() {
    // On load: the document's text box, selected, drawn by your component.
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
