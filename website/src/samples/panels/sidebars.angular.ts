import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSearch, EpdfSearchLayer, withSearch } from '@embedpdf/angular/search';
import { EpdfShell, withShell } from '@embedpdf/angular/shell';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'demo-workspace',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSearchLayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Both panels share the right side: opening one closes the other. -->
    <div class="toolbar">
      <button
        type="button"
        class="button"
        [attr.aria-pressed]="searchPanel.isOpen()"
        (click)="searchPanel.toggle({ exclusive: 'right' })"
      >
        Search
      </button>
      <button
        type="button"
        class="button"
        [attr.aria-pressed]="notesPanel.isOpen()"
        (click)="notesPanel.toggle({ exclusive: 'right' })"
      >
        Notes
      </button>
    </div>
    <div class="workspace">
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-search-layer />
        </ng-template>
      </epdf-stage>
      @if (searchPanel.isOpen()) {
        <aside class="panel" aria-label="Search">
          <header class="panel-header">
            <h3 class="panel-title">Search</h3>
            <button type="button" class="close" aria-label="Close" (click)="searchPanel.close()">
              ×
            </button>
          </header>
          <input
            #field
            class="field"
            type="search"
            aria-label="Search"
            [value]="text()"
            (input)="text.set(field.value)"
          />
          <ol class="list">
            @for (hit of search.hits(); track hit.page.objectNumber + ':' + hit.start) {
              <li>
                <button type="button" class="item" (click)="search.goToHit(hit)">
                  <span class="item-page">Page {{ hit.pageIndex + 1 }}</span>
                  @if (hit.snippet; as snippet) {
                    <span class="item-text">…{{ snippet.before }}<mark>{{ snippet.match }}</mark>{{ snippet.after }}…</span>
                  }
                </button>
              </li>
            }
          </ol>
        </aside>
      }
      @if (notesPanel.isOpen()) {
        <aside class="panel" aria-label="Notes">
          <header class="panel-header">
            <h3 class="panel-title">Notes</h3>
            <button type="button" class="close" aria-label="Close" (click)="notesPanel.close()">
              ×
            </button>
          </header>
          <textarea
            #area
            class="field notes"
            aria-label="Notes"
            placeholder="Your notes on this document…"
            [value]="notes()"
            (input)="notes.set(area.value)"
          ></textarea>
        </aside>
      }
    </div>
  `,
})
export class Workspace {
  private readonly shell = inject(EpdfShell);
  protected readonly search = inject(EpdfSearch);
  protected readonly searchPanel = this.shell.surface('search');
  protected readonly notesPanel = this.shell.surface('notes');
  protected readonly text = signal('PDF');
  // Your app's own data: it stays when the panel closes.
  protected readonly notes = signal('');

  constructor() {
    effect(() => {
      const text = this.text();
      untracked(() => void this.search.search({ text }));
    });
    // The search panel is open when the document is.
    this.shell.open('search', { exclusive: 'right' });
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, Workspace],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withSearch(),
      withShell(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sidebars.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-workspace *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
