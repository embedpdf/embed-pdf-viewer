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
  EpdfAnnotationTemplate,
  EpdfRichTextEditor,
  withAnnotation,
  type Annotation,
} from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
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
            <!-- Your own text box: the element is the editor, in your app's look. It fills
                 its frame, which the layer places and turns like the text box. -->
            <ng-template [epdfAnnotation]="isTextBox" let-annotation>
              <div
                [epdfRichTextEditor]="annotation"
                #editor="epdfRichTextEditor"
                class="text-box"
                [class.editing]="editor.editing()"
              ></div>
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
  private readonly document = inject(EpdfDocument);
  private added = false;

  // Kept in a field, the same function on every page: the layer registers the look once.
  protected readonly isTextBox = (annotation: Annotation) => annotation.subtype === 'free-text';

  constructor() {
    // On load: a text box on the cover, selected.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void this.annotation.create(
          cover,
          {
            subtype: 'free-text',
            box: { x: 106, y: 570, width: 380, height: 60 },
            contents: 'Double-click to type in your own text box',
            fontSize: 16,
            fontColor: '#1a2748',
          },
          undefined,
          { select: true },
        );
      });
    });
  }
}
