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
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfSelection,
  EpdfSelectionHandles,
  EpdfSelectionLayer,
  withSelection,
} from '@embedpdf/angular/selection';
import { localEngine } from '@embedpdf/engine';

// Each: the selected text and its handles. `null` is the viewer's accent: at 35% for the text.
const COLORS = [
  { name: 'Accent', color: null, handles: null, swatch: '#3858e9' },
  { name: 'Yellow', color: 'rgb(250 204 21 / 0.45)', handles: '#ca8a04', swatch: '#facc15' },
  { name: 'Green', color: 'rgb(34 197 94 / 0.35)', handles: '#16a34a', swatch: '#22c55e' },
  { name: 'Pink', color: 'rgb(236 72 153 / 0.3)', handles: '#db2777', swatch: '#ec4899' },
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    EpdfSelectionHandles,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection({ handles: { shadow: '0 1px 3px rgb(0 0 0 / 0.3)' } }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './colors.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        @for (choice of colors; track choice.name) {
          <button
            type="button"
            class="swatch"
            [attr.aria-label]="choice.name"
            [attr.aria-pressed]="selection.settings().color === choice.color"
            [style.background]="choice.swatch"
            (click)="
              selection.updateSettings({ color: choice.color, handles: { color: choice.handles } })
            "
          ></button>
        }
        <button type="button" class="button" (click)="selection.resetSettings()">Reset</button>
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
          <epdf-selection-layer />
        </ng-template>
        <epdf-selection-handles />
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly colors = COLORS;
  protected readonly fromCss = signal(false);
  protected readonly selection = inject(EpdfSelection);
  private readonly document = inject(EpdfDocument);

  constructor() {
    // Something selected on load: the title on the cover.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (cover) this.selection.select({ page: cover, start: 10, count: 52 });
    });
  }
}
