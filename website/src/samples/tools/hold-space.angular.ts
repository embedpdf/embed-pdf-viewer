import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  ElementRef,
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

// While Space is held over the pages, the hand tool is active; on release, the tool from before.
@Directive({
  selector: '[demoHoldSpaceToPan]',
  host: {
    '(window:keydown)': 'down($event)',
    '(window:keyup)': 'up($event)',
  },
})
export class HoldSpaceToPan {
  private readonly interaction = inject(EpdfInteraction);
  // Only over the pages, so Space still scrolls the rest of your page.
  private readonly viewer = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private held = false;

  protected down(event: KeyboardEvent) {
    if (event.code !== 'Space' || !this.viewer.matches(':hover')) return;
    event.preventDefault();
    if (event.repeat || this.held) return;
    this.held = true;
    this.interaction.pushTool('pan');
  }

  protected up(event: KeyboardEvent) {
    if (event.code !== 'Space' || !this.held) return;
    this.held = false;
    this.interaction.popTool();
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
    HoldSpaceToPan,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './hold-space.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <span class="badge" [attr.data-active]="panning()">{{ panning() ? 'Hand' : 'Select' }}</span>
        <span class="readout">
          {{
            panning() ? 'Drag to scroll, then let go of Space' : 'Hold Space over the pages to scroll'
          }}
        </span>
      </div>
      <div class="viewer" demoHoldSpaceToPan>
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-selection-layer />
          </ng-template>
        </epdf-stage>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly interaction = inject(EpdfInteraction);
  protected readonly panning = computed(() => this.interaction.activeToolId() === 'pan');
}
