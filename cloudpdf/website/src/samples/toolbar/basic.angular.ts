import { ChangeDetectionStrategy, Component, signal, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { standardCommands, withCommands } from '@embedpdf/angular/commands';
import {
  EpdfToolbar,
  EpdfToolbarCommandTemplate,
  group,
  item,
} from '@embedpdf/angular/toolbar';
import type { BarSchema } from '@embedpdf/angular/toolbar';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Your icons, by the names the standard commands give them.
const ICONS: Record<string, string> = {
  'previous-page': '‹',
  'next-page': '›',
  'zoom-out': '−',
  'zoom-in': '+',
  'fit-width': '↔',
  pointer: '↖',
  pan: '✥',
  highlight: '▍',
  underline: 'U̲',
  ink: '〰',
  download: '↓',
  print: '⎙',
};

const bar: BarSchema = {
  id: 'main',
  sections: {
    start: [group('pages', ['page:previous', 'page:next'])],
    center: [
      group('zoom', [
        'zoom:out',
        item('zoom:in', { variants: ['icon+label', 'icon'] }),
        item('zoom:fit-width', { variants: ['icon+label', 'icon'], importance: 2 }),
      ]),
    ],
    end: [
      group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight', 'tool:underline', 'tool:ink'], {
        collapse: 'menu',
      }),
      group('document', [item('document:download', { importance: 5 }), 'document:print']),
    ],
  },
};

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
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
      withAnnotation(),
      withCommands({ commands: standardCommands }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <!-- Narrow the toolbar to watch it make room: labels go first, then the tools fold, then "More". -->
      <label class="width">
        Toolbar width
        <input
          #range
          type="range"
          min="30"
          max="100"
          [value]="width()"
          (input)="width.set(+range.value)"
        />
        <output>{{ width() }}%</output>
      </label>
      <div class="frame" [style.width.%]="width()">
        <epdf-toolbar class="toolbar" [bar]="bar">
          <ng-template epdfToolbarCommand let-command let-variant="variant" let-run="run">
            <button
              type="button"
              class="button"
              [title]="command.label"
              [attr.aria-label]="command.label"
              [disabled]="!command.enabled"
              [attr.aria-pressed]="command.active"
              (click)="run()"
            >
              <span class="icon" aria-hidden="true">
                {{ icons[command.icon ?? ''] ?? command.label.charAt(0) }}
              </span>
              @if (variant === 'icon+label') {
                <span>{{ command.label }}</span>
              }
            </button>
          </ng-template>
        </epdf-toolbar>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer [annotations]="false" />
          <epdf-selection-layer />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly bar = bar;
  protected readonly icons = ICONS;
  protected readonly width = signal(100);
}
