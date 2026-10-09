import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const COLORS = ['#e5484d', '#1e90ff', '#30a46c', '#1a2748'];

// The pen's color and width, for the strokes that follow.
@Component({
  selector: 'demo-pen-style',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="swatches" role="group" aria-label="Pen color">
        @for (color of colors; track color) {
          <button
            type="button"
            class="swatch"
            [attr.aria-label]="color"
            [attr.aria-pressed]="defaults().color === color"
            [style.background]="color"
            (click)="annotation.tools.updateDefaults('ink', { color })"
          ></button>
        }
      </div>
      <input
        #picker
        type="color"
        class="color"
        aria-label="Any color"
        [value]="defaults().color ?? '#000000'"
        (input)="annotation.tools.updateDefaults('ink', { color: picker.value })"
      />
      <label class="range">
        Width
        <input
          #width
          type="range"
          min="1"
          max="12"
          [value]="defaults().strokeWidth ?? 1"
          (input)="annotation.tools.updateDefaults('ink', { strokeWidth: width.valueAsNumber })"
        />
        <output class="readout">{{ defaults().strokeWidth }} pt</output>
      </label>
    </div>
  `,
})
export class PenStyle {
  protected readonly colors = COLORS;
  protected readonly annotation = inject(EpdfAnnotation);
  protected readonly defaults = this.annotation.tools.defaultsOf('ink');
}

// Every change is kept for next time.
@Component({
  selector: 'demo-remember-defaults',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class RememberDefaults {
  constructor() {
    inject(EpdfAnnotation)
      .tools.defaultsChanged$.pipe(takeUntilDestroyed())
      .subscribe(({ toolId, defaults }) => {
        localStorage.setItem(`tool:${toolId}`, JSON.stringify(defaults));
      });
  }
}

// On load: the pen is active, with a stroke drawn in its current style.
@Component({
  selector: 'demo-start-with-the-pen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class StartWithThePen {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly interaction = inject(EpdfInteraction);
  private readonly document = inject(EpdfDocument);
  private added = false;

  constructor() {
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        const wave = Array.from({ length: 24 }, (_, i) => ({
          x: 300 + i * 10,
          y: 540 + Math.sin(i / 2) * 14,
        }));
        void this.annotation.create(cover, { subtype: 'ink', inkList: [wave] }, undefined, {
          tool: 'ink',
        });
        this.interaction.activateTool('ink');
      });
    });
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
    StartWithThePen,
    RememberDefaults,
    PenStyle,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      // The pen starts with what the reader picked last time: see RememberDefaults above.
      withAnnotation({
        tools: [{ id: 'ink', defaults: JSON.parse(localStorage.getItem('tool:ink') ?? '{}') }],
      }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tool-defaults.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-start-with-the-pen />
      <demo-remember-defaults />
      <demo-pen-style />
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
export class App {}
