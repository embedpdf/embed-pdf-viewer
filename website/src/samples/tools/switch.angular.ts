import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const LABELS: Record<string, string> = { pointer: 'Select', pan: 'Hand' };
const HINTS: Record<string, string> = {
  pointer: 'A drag selects text',
  pan: 'A drag scrolls the pages',
};

// A button for every tool you can switch to, the active one pressed.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSelectionLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      // The document opens with the hand tool.
      withInteraction({ defaultTool: 'pan' }),
      withSelection(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './switch.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Tool">
          @for (tool of interaction.tools(); track tool.id) {
            <button
              type="button"
              class="segment"
              [attr.aria-pressed]="tool.id === interaction.activeToolId()"
              (click)="interaction.activateTool(tool.id)"
            >
              {{ labels[tool.id] ?? tool.id }}
            </button>
          }
        </div>
        <output class="readout">{{ hint() }}</output>
      </div>
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
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly labels = LABELS;

  protected readonly hint = computed(() => {
    const activeToolId = this.interaction.activeToolId();
    return activeToolId ? HINTS[activeToolId] : '';
  });
}
