import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
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

// On load: the pen is active.
@Component({
  selector: 'demo-start-with-the-pen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class StartWithThePen {
  constructor() {
    inject(EpdfInteraction).activateTool('ink');
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
      { engine: () => localEngine(), initialDocuments: [{ source: review }] },
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
