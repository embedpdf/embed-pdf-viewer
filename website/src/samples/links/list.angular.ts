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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfLink, EpdfLinkLayer, withLink } from '@embedpdf/angular/link';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Where the links go on the first page, in page coordinates.
const TO_PAGE_3 = { x: 72, y: 24, width: 160, height: 28 };
const TO_WEBSITE = { x: 250, y: 24, width: 190, height: 28 };
const TO_SCRIPT = { x: 458, y: 24, width: 82, height: 28 };

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfLinkLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      // The annotation plugin is only here to make the links below.
      withAnnotation(),
      withLink(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './list.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="layout">
        <!-- The first page's links, read from the plugin, each with a button that follows it. -->
        <aside class="panel">
          <h3 class="heading">Links on page 1</h3>
          <ul class="links">
            @for (item of links(); track item.id) {
              <li class="link">
                <span class="kind">{{ item.target.kind }}</span>
                <span class="label">{{ link.getLabel(item) }}</span>
                <span class="where">at {{ round(item.bounds.x) }}, {{ round(item.bounds.y) }}</span>
                <button type="button" class="button" (click)="link.activate(item)">Follow</button>
              </li>
            }
          </ul>
          <p class="last">
            <code>activated$</code> {{ last() ?? 'not yet' }}
          </p>
        </aside>
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-link-layer />
          </ng-template>
        </epdf-stage>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly link = inject(EpdfLink);
  private readonly annotation = inject(EpdfAnnotation);
  private readonly document = inject(EpdfDocument);
  private added = false;
  protected readonly round = Math.round;

  /** The list reads the links once they're made, and again each time a page's links are read. */
  private readonly ready = signal(false);
  private readonly reads = signal(0);
  protected readonly links = computed(() => {
    this.reads();
    return this.ready() ? this.link.listLinks(0) : [];
  });
  protected readonly last = signal<string | null>(null);

  constructor() {
    // Every way of following a link ends up here: a click, a key, or code.
    this.link.activated$
      .pipe(takeUntilDestroyed())
      .subscribe(({ target, activation }) => this.last.set(`${target.kind} → ${activation.outcome}`));
    this.link.loaded$.pipe(takeUntilDestroyed()).subscribe(() => this.reads.update((n) => n + 1));

    // Made on load, since the document has none: a label the page shows, and a link over it.
    // The third one is a `javascript:` address, which a link never opens.
    effect(() => {
      const [first, , third] = this.document.pages();
      if (!first || !third || this.added) return;
      this.added = true;
      untracked(() => void this.addLinks(first.ref, third.ref).then(() => this.ready.set(true)));
    });
  }

  private async addLinks(first: PageRef, third: PageRef) {
    const label = (text: string, box: typeof TO_PAGE_3) =>
      this.annotation.create(first, {
        subtype: 'free-text',
        box,
        contents: text,
        fontSize: 13,
        fontColor: '#054fb3',
        interiorColor: '#e8f1ff',
        color: '#7db6ff',
        strokeWidth: 1,
      });
    await label('Go to page 3 →', TO_PAGE_3);
    await label('Open embedpdf.com ↗', TO_WEBSITE);
    await label('A script', TO_SCRIPT);
    await this.annotation.create(first, {
      subtype: 'link',
      rect: TO_PAGE_3,
      target: { kind: 'goto', destination: { kind: 'fit', page: third } },
    });
    await this.annotation.create(first, {
      subtype: 'link',
      rect: TO_WEBSITE,
      target: { kind: 'uri', uri: 'https://www.embedpdf.com' },
    });
    await this.annotation.create(first, {
      subtype: 'link',
      rect: TO_SCRIPT,
      target: { kind: 'uri', uri: 'javascript:alert(1)' },
    });
  }
}
