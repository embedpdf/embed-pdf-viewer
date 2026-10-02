import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRender, EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

interface Entry {
  id: number;
  text: string;
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './redraws.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      @let currentPage = stage.currentPage();
      <div class="panel">
        <div class="toolbar">
          <button
            type="button"
            class="button"
            [disabled]="!currentPage"
            (click)="currentPage && render.invalidate({ pages: [currentPage] })"
          >
            Redraw this page
          </button>
          <button
            type="button"
            class="button"
            [disabled]="!currentPage"
            (click)="
              currentPage && render.invalidate({ pages: [currentPage], scope: 'annotations' })
            "
          >
            Only its annotations
          </button>
          <!-- Changes whenever this page's pixels do: key your own long-lived renders on it. -->
          <output class="badge">
            render epoch <strong>{{ epochOf(currentPage) }}</strong>
          </output>
        </div>
        <ol class="log" aria-live="polite">
          @for (entry of entries(); track entry.id) {
            <li class="entry"><code>invalidated$</code> {{ entry.text }}</li>
          }
        </ol>
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
  protected readonly render = inject(EpdfRender);
  private readonly document = inject(EpdfDocument);
  protected readonly entries = signal<Entry[]>([]);
  private count = 0;

  constructor() {
    this.render.invalidated$.pipe(takeUntilDestroyed()).subscribe(({ pages, scope, origin }) => {
      const what = `${pages.length === 1 ? '1 page' : `${pages.length} pages`} · ${scope}`;
      const from = origin ? `an edit (${origin.kind})` : 'your code';
      const entry = { id: this.count++, text: `${what} · from ${from}` };
      this.entries.update((current) => [entry, ...current].slice(0, 4));
    });

    // Redraw the first page on load, so there's something in the list.
    effect(() => {
      if (this.document.status() !== 'ready') return;
      untracked(() => this.render.invalidate({ pages: [0] }));
    });
  }

  protected epochOf(page: PageRef | null): number {
    return page ? this.render.getRenderEpoch(page) : 0;
  }
}
