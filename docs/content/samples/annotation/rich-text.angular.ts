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
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

type Format = 'bold' | 'italic' | 'underline';
const FORMATS: readonly Format[] = ['bold', 'italic', 'underline'];

// The same calls style the selected words while typing, and the whole box otherwise.
@Component({
  selector: 'demo-rich-text-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      @for (format of formats; track format) {
        <button
          type="button"
          [class]="'button ' + format"
          [attr.aria-pressed]="isOn(format)"
          [disabled]="!hasText()"
          (click)="annotation.text.toggleFormat(format)"
        >
          {{ format[0]!.toUpperCase() }}
        </button>
      }
      <button
        type="button"
        class="button"
        [disabled]="!hasText()"
        (click)="annotation.selection.update({ fontColor: '#c00000' })"
      >
        Red
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!hasText()"
        (click)="annotation.selection.update({ fontSize: large() ? 16 : 24 })"
      >
        {{ large() ? '16 pt' : '24 pt' }}
      </button>
      <p class="hint">Ctrl or Cmd with B, I or U works while you type</p>
    </div>
  `,
})
export class RichTextToolbar {
  protected readonly annotation = inject(EpdfAnnotation);
  protected readonly formats = FORMATS;
  private readonly panel = this.annotation.selection.properties;
  protected readonly hasText = computed(() =>
    this.panel().properties.some((property) => property.control === 'textFormat'),
  );
  protected readonly large = computed(() => this.panel().values.fontSize === 24);

  // On when every selected word has it; `mixed` lists what the words disagree on.
  protected isOn(format: Format) {
    const { values, mixed } = this.panel();
    return values[format] === true && !mixed.includes(format);
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
    RichTextToolbar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './rich-text.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-rich-text-toolbar />
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
    // On load: a text box born with formatting, selected. Runs change the body only where they differ.
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
            interiorColor: '#fffbe6',
            richText: {
              body: { family: 'Helvetica', size: 16, color: '#1a2748' },
              paragraphs: [
                {
                  runs: [
                    { text: 'Double-click me, select a word, then make it ' },
                    { text: 'bold', style: { weight: 700 } },
                    { text: ' or ' },
                    { text: 'red', style: { color: '#c00000' } },
                    { text: '.' },
                  ],
                },
              ],
            },
          },
          undefined,
          { select: true },
        );
      });
    });
  }
}
