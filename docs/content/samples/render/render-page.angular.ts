import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfRender, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

interface Thumbnail {
  page: PageRef;
  url: string;
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate],
  // No Stage: these pictures are plain images, rendered on demand.
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './render-page.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div *epdfDocumentGate="let document; fallback: loading" class="images">
      <div class="strip" role="listbox" aria-label="Pages">
        @for (thumbnail of thumbnails(); track thumbnail.page.objectNumber; let index = $index) {
          <button
            type="button"
            role="option"
            class="thumbnail"
            [attr.aria-selected]="index === selected()"
            (click)="selected.set(index)"
          >
            <img [src]="thumbnail.url" [alt]="'Page ' + (index + 1)" />
            <span>{{ index + 1 }}</span>
          </button>
        }
      </div>
      <div class="preview">
        @if (preview(); as url) {
          <img [src]="url" [alt]="'Page ' + (selected() + 1) + ', 640 pixels wide'" />
        }
      </div>
    </div>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly render = inject(EpdfRender);
  private readonly document = inject(EpdfDocument);
  protected readonly thumbnails = signal<Thumbnail[]>([]);
  protected readonly selected = signal(0);
  protected readonly preview = signal<string | null>(null);

  constructor() {
    // A small picture of every page, a few rendered at a time.
    effect((onCleanup) => {
      const pages = this.document.pages();
      if (pages.length === 0) return;
      const controller = new AbortController();
      const revokes: (() => void)[] = [];
      onCleanup(() => {
        controller.abort();
        revokes.forEach((revoke) => revoke());
      });
      (async () => {
        const { applied } = await this.render.renderPages(
          pages.map((page) => page.ref),
          { width: 120, signal: controller.signal },
        );
        const ready = await Promise.all(
          applied.map(async ({ page, image }) => {
            const { url, revoke } = await image.objectUrl();
            revokes.push(revoke);
            return { page, url };
          }),
        );
        if (!controller.signal.aborted) this.thumbnails.set(ready);
      })().catch(() => {
        // cancelled: the document closed or the list changed
      });
    });

    // The chosen page, exactly 640 pixels wide.
    effect((onCleanup) => {
      const selected = this.selected();
      if (this.document.status() !== 'ready') return;
      const controller = new AbortController();
      let revoke: (() => void) | undefined;
      onCleanup(() => {
        controller.abort();
        revoke?.();
      });
      untracked(async () => {
        const image = await this.render.renderPage(selected, {
          width: 640,
          signal: controller.signal,
        });
        const object = await image.objectUrl();
        if (controller.signal.aborted) {
          object.revoke();
          return;
        }
        revoke = object.revoke;
        this.preview.set(object.url);
      }).catch(() => {
        // cancelled: another page was picked
      });
    });
  }
}
