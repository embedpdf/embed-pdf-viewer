import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfShell, withShell } from '@embedpdf/angular/shell';
import type { ShellSnapshot } from '@embedpdf/angular/shell';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The browser may refuse storage, in a private window: then nothing is remembered.
const loadLayout = (): ShellSnapshot | null => {
  try {
    return JSON.parse(localStorage.getItem('panels') ?? 'null') as ShellSnapshot | null;
  } catch {
    return null;
  }
};
const saveLayout = (snapshot: ShellSnapshot) => {
  try {
    localStorage.setItem('panels', JSON.stringify(snapshot));
  } catch {
    // Not remembered this time.
  }
};

const TIPS = [
  'Ctrl or ⌘ and scroll to zoom',
  'Pinch to zoom on a touch screen',
  'Drag between pages to scroll',
];

@Component({
  selector: 'demo-workspace',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button
        type="button"
        class="button"
        [attr.aria-pressed]="tips.isOpen()"
        (click)="tips.toggle({ exclusive: 'left' })"
      >
        Tips
      </button>
      <button
        type="button"
        class="button"
        [attr.aria-pressed]="notes.isOpen()"
        (click)="notes.toggle({ exclusive: 'right' })"
      >
        Notes
      </button>
      <span class="spacer"></span>
      <button type="button" class="button" (click)="save()">Save layout</button>
      <button type="button" class="button" [disabled]="!saved()" (click)="restore()">
        Restore
      </button>
    </div>
    <p class="readout">Open: {{ open() || 'no panels' }}</p>
    <div class="workspace">
      @if (tips.isOpen()) {
        <aside class="panel" aria-label="Tips">
          <h3 class="panel-title">Tips</h3>
          <ul class="tips">
            @for (tip of tipList; track tip) {
              <li>{{ tip }}</li>
            }
          </ul>
        </aside>
      }
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
      @if (notes.isOpen()) {
        <aside class="panel" aria-label="Notes">
          <h3 class="panel-title">Notes</h3>
          <textarea
            class="notes"
            aria-label="Notes"
            placeholder="Your notes on this document…"
          ></textarea>
        </aside>
      }
    </div>
  `,
})
export class Workspace {
  private readonly shell = inject(EpdfShell);
  protected readonly tips = this.shell.surface('tips');
  protected readonly notes = this.shell.surface('notes');
  protected readonly tipList = TIPS;
  protected readonly saved = signal(loadLayout());
  protected readonly open = computed(() =>
    this.shell
      .openSurfaces()
      .map((surface) => surface.id)
      .join(', '),
  );

  constructor() {
    // The layout saved last time, or the tips the first time.
    const layout = loadLayout();
    if (layout) this.shell.applySnapshot(layout);
    else this.shell.open('tips', { exclusive: 'left' });
  }

  protected save() {
    const layout = this.shell.getSnapshot();
    saveLayout(layout);
    this.saved.set(layout);
  }

  protected restore() {
    const saved = this.saved();
    if (saved) this.shell.applySnapshot(saved);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, Workspace],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withShell(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './remember.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-workspace *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
