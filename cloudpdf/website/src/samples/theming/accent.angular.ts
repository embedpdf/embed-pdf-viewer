import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocument,
  EpdfDocumentGate,
  epdfTheme,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfSelection, EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { cloudEngine } from '@cloudpdf/engine';

// The characters of the cover's title.
const TITLE = { start: 10, count: 52 };
const SWATCHES = ['#3858e9', '#e91e63', '#0f6e56', '#c2410c'];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The cover's title is selected on load, so the accent shows; drag over any text to see more.
@Component({
  selector: 'demo-select-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class SelectTitle {
  constructor() {
    const selection = inject(EpdfSelection);
    const document = inject(EpdfDocument);
    effect(() => {
      const cover = document.pages()[0]?.ref;
      if (cover) untracked(() => selection.select({ page: cover, ...TITLE }));
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
    EpdfSelectionLayer,
    SelectTitle,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './accent.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="pdf-viewer" [style]="theme()">
      <div class="toolbar">
        <label class="picker">
          Accent
          <input #picker type="color" [value]="accent()" (input)="accent.set(picker.value)" />
        </label>
        @for (swatch of swatches; track swatch) {
          <button
            type="button"
            class="swatch"
            [attr.aria-label]="'Accent ' + swatch"
            [attr.aria-pressed]="swatch === accent()"
            [style.background]="swatch"
            (click)="accent.set(swatch)"
          ></button>
        }
        <code class="value">--epdf-accent: {{ accent() }}</code>
      </div>
      <ng-container *epdfDocumentGate="let document; fallback: loading">
        <demo-select-title />
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-selection-layer />
          </ng-template>
        </epdf-stage>
      </ng-container>
    </div>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly swatches = SWATCHES;
  protected readonly accent = signal('#e91e63');
  // Every part inside follows the variables; a variable set in your stylesheet still wins.
  protected readonly theme = computed(() => epdfTheme({ accent: this.accent() }));
}
