import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfAnnotation,
  EpdfAnnotationDraftMenu,
  EpdfAnnotationLayer,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'polyline', label: 'Polyline' },
];

@Component({
  selector: 'demo-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Tool">
        @for (tool of tools; track tool.id) {
          <button
            type="button"
            [attr.aria-pressed]="interaction.activeToolId() === tool.id"
            (click)="interaction.activateTool(tool.id)"
          >
            {{ tool.label }}
          </button>
        }
      </div>
      <p class="hint">Delete removes the selection; Escape stops a shape</p>
    </div>
  `,
})
export class Toolbar {
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly tools = TOOLS;

  constructor() {
    // The polygon tool is active on load: click a few points on the page.
    this.interaction.activateTool('polygon');
  }
}

// Done and Cancel next to the shape being drawn, for touch screens.
@Component({
  selector: 'demo-draft-menu',
  imports: [EpdfAnnotationDraftMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <epdf-annotation-draft-menu #menu="epdfAnnotationDraftMenu">
      <div class="menu" role="toolbar" aria-label="Shape">
        <button
          type="button"
          [disabled]="!menu.draft()?.canFinish"
          (click)="annotation.draft.finish()"
        >
          Done
        </button>
        <button type="button" (click)="annotation.draft.cancel()">Cancel</button>
      </div>
    </epdf-annotation-draft-menu>
  `,
})
export class DraftMenu {
  protected readonly annotation = inject(EpdfAnnotation);
}

// Delete and Escape: the plugin leaves the keys to your app.
@Component({
  selector: 'demo-annotation-keys',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:keydown)': 'onKey($event)' },
  template: '',
})
export class AnnotationKeys {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly interaction = inject(EpdfInteraction);

  protected onKey(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || this.annotation.text.getEditing()) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      void this.annotation.selection.delete();
    }
    if (event.key === 'Escape') {
      this.annotation.cancel(); // a drag or a polygon in progress
      this.interaction.activateDefaultTool();
    }
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    AnnotationKeys,
    Toolbar,
    DraftMenu,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './polygon.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-annotation-keys />
      <demo-toolbar />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer />
        </ng-template>
        <demo-draft-menu />
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
