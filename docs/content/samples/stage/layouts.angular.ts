import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import type { FlowMode, LayoutKind, SpreadMode } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      // Facing pages from the start, like a book.
      withStage({ spread: 'odd' }),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './layouts.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <label class="label">
          Flow
          <select
            #flow
            class="select"
            [value]="stage.settings().flow"
            (change)="stage.updateSettings({ flow: asFlow(flow.value) })"
          >
            <option value="continuous">continuous</option>
            <option value="paged">paged</option>
          </select>
        </label>
        <label class="label">
          Layout
          <select
            #layout
            class="select"
            [value]="stage.settings().layout"
            (change)="stage.updateSettings({ layout: asLayout(layout.value) })"
          >
            <option value="vertical">vertical</option>
            <option value="horizontal">horizontal</option>
            <option value="grid">grid</option>
          </select>
        </label>
        <label class="label">
          Spread
          <select
            #spread
            class="select"
            [value]="stage.settings().spread"
            (change)="stage.updateSettings({ spread: asSpread(spread.value) })"
          >
            <option value="none">none</option>
            <option value="odd">odd</option>
            <option value="even">even</option>
          </select>
        </label>
        <div class="pager">
          <button type="button" class="button" aria-label="Previous" (click)="stage.previousPage()">
            ‹
          </button>
          <button type="button" class="button" aria-label="Next" (click)="stage.nextPage()">
            ›
          </button>
        </div>
      </div>

      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  // A select's value is a string; these say which one it is.
  protected asFlow = (value: string) => value as FlowMode;
  protected asLayout = (value: string) => value as LayoutKind;
  protected asSpread = (value: string) => value as SpreadMode;
}
