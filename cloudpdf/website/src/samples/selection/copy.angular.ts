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
  copySelection,
  EpdfSelection,
  EpdfSelectionClipboard,
  EpdfSelectionLayer,
  withSelection,
} from '@embedpdf/angular/selection';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'demo-copy-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button
        type="button"
        class="button"
        [disabled]="!selection.hasSelection() || !selection.canCopy()"
        (click)="copy()"
      >
        Copy
      </button>
      <output class="readout">{{ status() || 'Or press Ctrl+C' }}</output>
    </div>
  `,
})
export class CopyButton {
  protected readonly selection = inject(EpdfSelection);
  protected readonly status = signal('');

  protected copy() {
    copySelection(this.selection).then(
      (text) => this.status.set(`Copied ${text.length} characters`),
      // The browser can refuse the clipboard, for example in a frame that doesn't allow it.
      () => this.status.set("The browser didn't allow copying"),
    );
  }
}

// The selected text, read with readText() each time the selection settles.
@Component({
  selector: 'demo-selected-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="preview">{{ text() || 'Select some text to read it here.' }}</p>`,
})
export class SelectedText {
  private readonly selection = inject(EpdfSelection);
  protected readonly text = signal('');

  constructor() {
    effect((onCleanup) => {
      this.selection.range();
      if (this.selection.isSelecting() || !this.selection.canCopy()) return;
      // A newer selection cancels a read that hasn't finished.
      const controller = new AbortController();
      this.selection.readText({ signal: controller.signal }).then(
        (text) => this.text.set(text),
        () => {},
      );
      onCleanup(() => controller.abort());
    });
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    EpdfSelectionClipboard,
    CopyButton,
    SelectedText,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './copy.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <epdf-selection-clipboard />
      <demo-copy-button />
      <demo-selected-text />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-selection-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly selection = inject(EpdfSelection);
  private readonly document = inject(EpdfDocument);

  constructor() {
    // Something selected on load: the title on the cover.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (cover) this.selection.select({ page: cover, start: 10, count: 52 });
    });
  }
}
