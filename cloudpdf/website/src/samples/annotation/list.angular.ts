import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  annotationKey,
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
  type Annotation,
  type AnnotationSubtype,
} from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// A line of text, as the four corners a highlight takes.
const quad = (x: number, y: number, width: number, height: number) => ({
  upperLeft: { x, y },
  upperRight: { x: x + width, y },
  lowerLeft: { x, y: y + height },
  lowerRight: { x: x + width, y: y + height },
});

interface Kind {
  label: string;
  subtype?: AnnotationSubtype;
}

const KINDS: Kind[] = [
  { label: 'All' },
  { label: 'Highlights', subtype: 'highlight' },
  { label: 'Notes', subtype: 'text' },
  { label: 'Rectangles', subtype: 'square' },
];

/**
 * The annotations of one kind, in drawing order. A click shows one on its page. Next to
 * `<epdf-stage #stage="epdfStage">`: `<div demoAnnotationList [stage]="stage"></div>`.
 */
@Component({
  selector: 'div[demoAnnotationList]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel' },
  template: `
    <div class="segmented" role="group" aria-label="Kind">
      @for (each of kinds; track each.label) {
        <button type="button" [attr.aria-pressed]="each === kind()" (click)="kind.set(each)">
          {{ each.label }}
        </button>
      }
    </div>
    <p class="count">{{ annotations().length }} found</p>
    <ul class="items">
      @for (each of annotations(); track key(each.ref)) {
        <li>
          <button type="button" class="item" (click)="show(each)">
            <span class="kind"
              >{{ each.subtype }} · page {{ pageNumberOf(each.page.objectNumber) }}</span
            >
            <span>{{ each.contents ?? '—' }}</span>
          </button>
        </li>
      }
    </ul>
  `,
})
export class AnnotationList {
  readonly stage = input.required<EpdfStage>();

  private readonly annotation = inject(EpdfAnnotation);
  private readonly pages = inject(EpdfDocument).pages;
  protected readonly kinds = KINDS;
  protected readonly kind = signal(KINDS[0]!);
  protected readonly annotations = this.annotation.watch(() => {
    const subtype = this.kind().subtype;
    return subtype ? { subtype } : undefined;
  });
  protected readonly key = annotationKey;

  protected pageNumberOf(objectNumber: number) {
    return this.pages().findIndex((page) => page.ref.objectNumber === objectNumber) + 1;
  }

  protected show(each: Annotation) {
    this.stage().reveal(each.page, { rect: each.rect });
    this.annotation.selection.set([each.ref]);
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
    AnnotationList,
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
  styleUrl: './list.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="viewer">
        <epdf-stage #stage="epdfStage" class="stage">
          <ng-template epdfPage>
            <epdf-render-layer [annotations]="false" />
            <epdf-annotation-layer />
          </ng-template>
        </epdf-stage>
        <div demoAnnotationList [stage]="stage"></div>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly pages = inject(EpdfDocument).pages;
  private added = false;

  constructor() {
    // On load: highlights, notes and a rectangle on the first two pages.
    effect(() => {
      const [cover, second] = this.pages();
      if (this.annotation.status() !== 'ready' || !cover || !second || this.added) return;
      this.added = true;
      void this.annotation.create(cover.ref, {
        subtype: 'highlight',
        quadPoints: [quad(106, 218, 352, 49)],
        color: '#ffcd45',
        contents: 'The title',
      });
      void this.annotation.create(cover.ref, {
        subtype: 'text',
        rect: { x: 470, y: 232, width: 20, height: 20 },
        contents: 'Can we shorten it?',
        color: '#facc15',
      });
      void this.annotation.create(second.ref, {
        subtype: 'highlight',
        quadPoints: [quad(57, 57, 242, 36), quad(57, 93, 265, 36)],
        color: '#ffcd45',
        contents: 'The opening line',
      });
      void this.annotation.create(second.ref, {
        subtype: 'square',
        box: { x: 52, y: 580, width: 470, height: 64 },
        color: '#e5484d',
        strokeWidth: 2,
        contents: 'Rewrite this paragraph',
      });
    });
  }
}
