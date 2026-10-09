import {
  ChangeDetectionStrategy,
  Component,
  effect,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

interface Entry {
  id: number;
  event: string;
  detail: string;
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
  styleUrl: './events.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div *epdfDocumentGate="let document; fallback: loading" class="layout">
      <!-- The latest stage events, newest first. Scroll, zoom or resize to add more. -->
      <ol class="log" aria-live="polite">
        @for (entry of entries(); track entry.id) {
          <li class="entry">
            <code class="name">{{ entry.event }}</code>
            <span class="detail">{{ entry.detail }}</span>
          </li>
        }
      </ol>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </div>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly entries = signal<Entry[]>([]);
  private readonly stage = viewChild(EpdfStage);
  private count = 0;

  constructor() {
    effect((onCleanup) => {
      const stage = this.stage();
      if (!stage) return;
      const subscriptions = [
        stage.pageChanged$.subscribe(({ pageIndex, previousPageIndex }) =>
          this.log('pageChanged$', `page ${previousPageIndex + 1} → ${pageIndex + 1}`),
        ),
        stage.zoomChanged$.subscribe(({ level, mode }) =>
          this.log('zoomChanged$', `${Math.round(level * 100)}%, ${mode}`),
        ),
        stage.motionEnded$.subscribe(({ camera }) =>
          this.log('motionEnded$', `at rest, ${Math.round(camera.zoom * 100)}%`),
        ),
        stage.viewportChanged$.subscribe(({ size }) =>
          this.log('viewportChanged$', `${Math.round(size.width)} × ${Math.round(size.height)}`),
        ),
      ];
      onCleanup(() => subscriptions.forEach((subscription) => subscription.unsubscribe()));
    });

    // Glide to the second page on load, so the log has something to show.
    effect(() => {
      const stage = this.stage();
      if (!stage || stage.pageCount() === 0) return;
      untracked(() => stage.goToPage(1));
    });
  }

  private log(event: string, detail: string) {
    this.entries.update((current) => [{ id: this.count++, event, detail }, ...current].slice(0, 6));
  }
}
