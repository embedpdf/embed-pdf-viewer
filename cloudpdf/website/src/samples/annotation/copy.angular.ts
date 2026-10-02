import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

/**
 * A read passed to create() makes the same annotation again, here on the next page. Next to
 * `<epdf-stage #stage="epdfStage">`: `<demo-copy-button [stage]="stage" />`.
 */
@Component({
  selector: 'demo-copy-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button
        type="button"
        class="button"
        [disabled]="annotation.selected().length !== 1 || !next()"
        (click)="copyToNextPage()"
      >
        Copy to the next page
      </button>
      <span class="spacer"></span>
      <output class="readout">
        {{ status() || (first() ? 'Ready to copy' : 'Select an annotation to copy') }}
      </output>
    </div>
  `,
})
export class CopyButton {
  readonly stage = input.required<EpdfStage>();

  protected readonly annotation = inject(EpdfAnnotation);
  private readonly pages = inject(EpdfDocument).pages;
  protected readonly status = signal('');
  protected readonly first = computed(() => this.annotation.selected()[0]);
  protected readonly next = computed(() => {
    const first = this.first();
    if (!first) return undefined;
    const pages = this.pages();
    const index = pages.findIndex((page) => page.ref.objectNumber === first.page.objectNumber);
    return pages[index + 1];
  });

  protected async copyToNextPage() {
    const first = this.first();
    const next = this.next();
    if (!first || !next) return;
    const copy = this.annotation.get(first.ref)!;
    const { annotation: made } = await this.annotation.create(next.ref, copy, undefined, {
      select: true, // so the next click copies the copy, a page further
    });
    this.stage().reveal(next.ref, { rect: made.rect });
    this.status.set(`Copied to page ${next.index + 1}`);
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
    CopyButton,
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
  styleUrl: './copy.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-copy-button [stage]="stage" />
      <epdf-stage #stage="epdfStage" class="stage">
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
  private readonly pages = inject(EpdfDocument).pages;
  private readonly stage = viewChild(EpdfStage);
  private added = false;

  constructor() {
    // On load: a rectangle and a text box on the cover, the rectangle selected and in view.
    effect(() => {
      const stage = this.stage();
      const cover = this.pages()[0]?.ref;
      if (!stage || !cover || this.annotation.status() !== 'ready' || this.added) return;
      this.added = true;
      untracked(() => this.addAnnotations(stage, cover));
    });
  }

  private addAnnotations(stage: EpdfStage, cover: PageRef) {
    void this.annotation.create(cover, {
      subtype: 'free-text',
      box: { x: 300, y: 512, width: 230, height: 40 },
      contents: 'Copy me too',
      fontSize: 16,
      fontColor: '#1a2748',
      interiorColor: '#fffbe6',
    });
    void this.annotation
      .create(
        cover,
        {
          subtype: 'square',
          box: { x: 96, y: 506, width: 178, height: 54 },
          color: '#e5484d',
          interiorColor: '#ffe4e1',
          strokeWidth: 3,
        },
        undefined,
        { select: true },
      )
      .then(({ annotation: made }) => stage.reveal(cover, { rect: made.rect }));
  }
}
