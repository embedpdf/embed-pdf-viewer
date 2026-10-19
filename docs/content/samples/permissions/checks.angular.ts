import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocument,
  EpdfDocumentGate,
  EpdfDocuments,
  EpdfViewer,
  provideEmbedPdf,
  saveFile,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  copySelection,
  EpdfSelection,
  EpdfSelectionLayer,
  withSelection,
} from '@embedpdf/angular/selection';
import { EpdfSearch, EpdfSearchLayer, withSearch } from '@embedpdf/angular/search';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// What each role may do, as permissions.
const roles = {
  viewer: ['doc.open', 'doc.render', 'doc.text.select'],
  reviewer: ['doc.open', 'doc.render', 'doc.text.select', 'doc.text.copy', 'doc.text.search'],
  owner: [
    'doc.open',
    'doc.render',
    'doc.text.select',
    'doc.text.copy',
    'doc.text.search',
    'doc.download',
  ],
};
type Role = keyof typeof roles;

// Each control shows only when its check says yes.
@Component({
  selector: 'demo-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      @if (search.canSearch()) {
        <input
          #query
          class="field"
          type="search"
          aria-label="Search"
          [value]="text()"
          (input)="text.set(query.value)"
        />
      }
      @if (selection.canCopy()) {
        <button
          type="button"
          class="button"
          [disabled]="!selection.hasSelection()"
          (click)="copy()"
        >
          Copy
        </button>
      }
      @if (documents.canDownload()) {
        <button type="button" class="button" (click)="download()">Download</button>
      }
    </div>
    <p class="note">{{ copied() ? 'Copied: “' + copied() + '”' : ' ' }}</p>
  `,
})
export class Controls {
  protected readonly documents = inject(EpdfDocuments);
  protected readonly search = inject(EpdfSearch);
  protected readonly selection = inject(EpdfSelection);
  private readonly document = inject(EpdfDocument);
  protected readonly text = signal('PDF');
  protected readonly copied = signal('');

  constructor() {
    // On load: a search, and some text selected, so every check has something to act on.
    effect(() => {
      const text = this.text();
      untracked(() => {
        if (this.search.canSearch()) void this.search.search({ text });
      });
    });
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (cover) untracked(() => this.selection.select({ page: cover, start: 10, count: 52 }));
    });
  }

  protected async copy() {
    await copySelection(this.selection).catch(() => {}); // the browser may refuse the clipboard
    this.copied.set(await this.selection.readText());
  }

  protected async download() {
    saveFile(await this.documents.download(), 'ebook.pdf');
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSearchLayer,
    EpdfSelectionLayer,
    Controls,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
        scope: roles.reviewer,
        initialDocuments: [{ source: ebook, name: 'ebook.pdf' }],
      },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
      withSearch(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './checks.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="toolbar">
      <label class="label">
        Role
        <select #picker class="select" [value]="role()" (change)="pickRole(picker.value)">
          <option value="viewer">viewer: read and select</option>
          <option value="reviewer">reviewer: also search and copy</option>
          <option value="owner">owner: also download</option>
        </select>
      </label>
    </div>
    <ng-container *epdfDocumentGate="let document; fallback: opening">
      <demo-controls />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-search-layer />
          <epdf-selection-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #opening><p class="loading">Opening…</p></ng-template>
  `,
})
export class App {
  private readonly viewer = inject(EpdfViewer);
  private readonly documents = inject(EpdfDocuments);
  private readonly document = inject(EpdfDocument);
  protected readonly role = signal<Role>('reviewer');

  // A document keeps the permissions it opened with, so a new role opens it again.
  protected async pickRole(value: string) {
    const role = value as Role;
    this.role.set(role);
    this.viewer.updateSettings({ scope: roles[role] });
    const id = this.document.id();
    if (!id) return;
    await this.documents.close(id);
    await this.documents.open(ebook, { name: 'ebook.pdf' });
  }
}
