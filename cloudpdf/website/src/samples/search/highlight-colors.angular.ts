import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSearch, EpdfSearchLayer, withSearch } from '@embedpdf/angular/search';
import { cloudEngine } from '@cloudpdf/engine';

// Each pair: every match, and the active one.
const COLORS = [
  { name: 'Yellow', color: '#ffd500', activeColor: '#ff9632' },
  { name: 'Blue', color: '#a5d8ff', activeColor: '#4c9bff' },
  { name: 'Green', color: '#b2f2bb', activeColor: '#40c057' },
  { name: 'Pink', color: '#fcc2d7', activeColor: '#f06595' },
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSearchLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withSearch({ highlight: { color: '#ffd500', activeColor: '#ff9632' } }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './highlight-colors.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        @for (choice of colors; track choice.name) {
          <button
            type="button"
            class="swatch"
            [attr.aria-label]="choice.name"
            [attr.aria-pressed]="search.settings().highlight.color === choice.color"
            [style.background]="
              'linear-gradient(135deg, ' + choice.color + ' 50%, ' + choice.activeColor + ' 50%)'
            "
            (click)="
              search.updateSettings({
                highlight: { color: choice.color, activeColor: choice.activeColor },
              })
            "
          ></button>
        }
        <button type="button" class="button" (click)="search.resetSettings()">Reset</button>
        <label class="option">
          <input
            #override
            type="checkbox"
            [checked]="fromCss()"
            (change)="fromCss.set(override.checked)"
          />
          Override with CSS
        </label>
      </div>
      <epdf-stage class="stage" [class.from-css]="fromCss()">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-search-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly colors = COLORS;
  protected readonly fromCss = signal(false);
  protected readonly search = inject(EpdfSearch);
  private readonly document = inject(EpdfDocument);

  constructor() {
    // Something to highlight, once the document is open.
    effect(() => {
      if (this.document.status() === 'ready') {
        void this.search.search({ text: 'PDF' });
      }
    });
  }
}
