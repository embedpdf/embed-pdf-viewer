import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { standardCommands, withCommands } from '@embedpdf/angular/commands';
import { EpdfToolbar, EpdfToolbarCommandTemplate, group } from '@embedpdf/angular/toolbar';
import type { BarSchema } from '@embedpdf/angular/toolbar';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A bar per mode.
const viewBar: BarSchema = {
  id: 'view',
  sections: {
    start: [group('tools', ['tool:pointer', 'tool:pan'])],
    center: [
      group('pages', ['page:previous', 'page:next']),
      group('zoom', ['zoom:out', 'zoom:in']),
    ],
  },
};

const annotateBar: BarSchema = {
  id: 'annotate',
  sections: {
    start: [group('markup', ['tool:highlight', 'tool:underline', 'tool:strikeout'])],
    center: [group('draw', ['tool:ink', 'tool:square', 'tool:circle', 'tool:note'])],
    end: [group('edit', ['annotation:delete'])],
  },
};

type Mode = 'view' | 'annotate';
const BARS: Record<Mode, BarSchema> = { view: viewBar, annotate: annotateBar };
const TOOL_OF_MODE: Record<Mode, string> = { view: 'pointer', annotate: 'highlight' };

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    EpdfAnnotationLayer,
    EpdfToolbar,
    EpdfToolbarCommandTemplate,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
      withAnnotation(),
      withCommands({ commands: standardCommands }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './modes.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="chrome">
        <div class="modes" role="tablist" aria-label="Mode">
          @for (each of modes; track each) {
            <button
              type="button"
              role="tab"
              class="mode"
              [attr.aria-selected]="mode() === each"
              (click)="switchTo(each)"
            >
              {{ each === 'view' ? 'View' : 'Annotate' }}
            </button>
          }
        </div>
        <epdf-toolbar class="toolbar" [bar]="bars[mode()]">
          <ng-template epdfToolbarCommand let-command let-run="run">
            <button
              type="button"
              class="button"
              [disabled]="!command.enabled"
              [attr.aria-pressed]="command.active"
              (click)="run()"
            >
              {{ command.label }}
            </button>
          </ng-template>
        </epdf-toolbar>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-selection-layer />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly interaction = inject(EpdfInteraction);
  protected readonly modes = ['view', 'annotate'] as const;
  protected readonly bars = BARS;
  protected readonly mode = signal<Mode>('view');

  // Each mode starts with its own tool.
  protected switchTo(next: Mode) {
    this.mode.set(next);
    this.interaction.activateTool(TOOL_OF_MODE[next]);
  }
}
