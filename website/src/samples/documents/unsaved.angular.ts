import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EpdfDocument,
  EpdfDocumentGate,
  EpdfDocuments,
  provideEmbedPdf,
  saveFile,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfMetadata, withMetadata } from '@embedpdf/angular/metadata';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'demo-title-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <input
        #field
        class="field"
        aria-label="Title"
        [value]="title()"
        (blur)="metadata.update({ title: field.value })"
      />
      <span class="badge" [attr.data-unsaved]="document.hasUnsavedChanges()">
        {{ document.hasUnsavedChanges() ? 'Unsaved changes' : 'Downloaded' }}
      </span>
      <button type="button" class="button" (click)="download()">Download</button>
    </div>
  `,
})
export class TitleBar {
  private readonly documents = inject(EpdfDocuments);
  protected readonly document = inject(EpdfDocument);
  protected readonly metadata = inject(EpdfMetadata);
  protected readonly title = computed(() => this.metadata.fields()?.title ?? '');

  constructor() {
    // A change on load: the document gets a new title, so it has something to lose.
    void this.metadata.update({ title: 'Quarterly report (draft)' });

    // While there's something to lose, the browser asks before the page closes.
    effect((onCleanup) => {
      if (!this.document.hasUnsavedChanges()) return;
      const warn = (event: BeforeUnloadEvent) => event.preventDefault();
      window.addEventListener('beforeunload', warn);
      onCleanup(() => window.removeEventListener('beforeunload', warn));
    });
  }

  protected async download() {
    saveFile(await this.documents.download(), 'report.pdf');
  }
}

@Component({
  selector: 'demo-change-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="log" aria-live="polite">
      @for (entry of entries().slice(0, 3); track entries().length - $index) {
        <li>{{ entry }}</li>
      }
    </ul>
  `,
})
export class ChangeLog {
  protected readonly entries = signal<string[]>([]);

  constructor() {
    inject(EpdfDocuments)
      .unsavedChangesChanged$.pipe(takeUntilDestroyed())
      .subscribe(({ hasUnsavedChanges }) =>
        this.entries.update((previous) => [
          hasUnsavedChanges
            ? 'It has changes that weren’t downloaded'
            : 'Downloaded: nothing to lose',
          ...previous,
        ]),
      );
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, TitleBar, ChangeLog],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook, name: 'report.pdf' }] },
      withStage(),
      withRender(),
      withMetadata(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './unsaved.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: opening">
      <demo-title-bar />
      <demo-change-log />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #opening><p class="loading">Opening…</p></ng-template>
  `,
})
export class App {}
