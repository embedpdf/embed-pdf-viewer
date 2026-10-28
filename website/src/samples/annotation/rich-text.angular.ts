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
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

const notice = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/notice.pdf');
  return { kind: 'bytes', id: 'notice', bytes: new Uint8Array(await response.arrayBuffer()) };
};

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
    EpdfSelectionLayer,
    EpdfAnnotationLayer,
    RichTextToolbar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: notice }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
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
          <epdf-selection-layer />
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
    // On load: the document's rich text box, selected.
    effect(() => {
      const stage = this.stage();
      if (!stage || this.annotation.status() !== 'ready' || this.done) return;
      this.done = true;
      untracked(() => {
        const richText = this.annotation.list().find((each) => each.nm === 'rich-text');
        if (!richText) return;
        this.annotation.selection.set([richText.ref]);
        stage.reveal(richText.page, { rect: richText.rect });
      });
    });
  }
}
