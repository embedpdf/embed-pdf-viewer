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
import { EpdfSearch, EpdfSearchLayer, withSearch } from '@embedpdf/angular/search';
import type { SearchHit } from '@embedpdf/angular/search';
import { EpdfShell, withShell } from '@embedpdf/angular/shell';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The panel shows the match its props name, and steps to the next one without reopening.
@Component({
  selector: 'aside[demoMatchPanel]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel', 'aria-label': 'Match' },
  template: `
    <header class="panel-header">
      <h3 class="panel-title">Match {{ index() + 1 }} of {{ search.hits().length }}</h3>
      <button type="button" class="close" aria-label="Close" (click)="panel.close()">×</button>
    </header>
    @if (hit(); as hit) {
      <p class="page">Page {{ hit.pageIndex + 1 }}</p>
      @if (hit.snippet; as snippet) {
        <p class="snippet">…{{ snippet.before }}<mark>{{ snippet.match }}</mark>{{ snippet.after }}…</p>
      }
    } @else {
      <p class="page">Searching…</p>
    }
    <div class="steps">
      <button type="button" class="button" [disabled]="index() === 0" (click)="show(index() - 1)">
        ← Previous
      </button>
      <button
        type="button"
        class="button"
        [disabled]="index() >= search.hits().length - 1"
        (click)="show(index() + 1)"
      >
        Next →
      </button>
    </div>
  `,
})
export class MatchPanel {
  private readonly shell = inject(EpdfShell);
  protected readonly search = inject(EpdfSearch);
  protected readonly panel = this.shell.surface('match');
  protected readonly index = computed(() => {
    const index = this.panel.props()['index'];
    return typeof index === 'number' ? index : 0;
  });
  protected readonly hit = computed(() => this.search.hits()[this.index()]);

  protected show(next: number) {
    this.shell.updateSurfaceProps('match', { index: next });
    this.search.goToHit(this.search.hits()[next]);
  }
}

@Component({
  selector: 'div[demoWorkspace]',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSearchLayer, MatchPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'workspace' },
  template: `
    <epdf-stage class="stage">
      <ng-template epdfPage>
        <epdf-render-layer />
        <!-- A click on a match opens it in the panel. -->
        <epdf-search-layer (hitClick)="open($event)" />
      </ng-template>
    </epdf-stage>
    @if (panel.isOpen()) {
      <aside demoMatchPanel></aside>
    }
  `,
})
export class Workspace {
  private readonly shell = inject(EpdfShell);
  private readonly search = inject(EpdfSearch);
  protected readonly panel = this.shell.surface('match');

  constructor() {
    // Every "PDF" on the pages, and the first one open in the panel.
    void this.search.search({ text: 'PDF' });
    this.shell.open('match', { exclusive: 'right', props: { index: 0 } });
  }

  protected open(hit: SearchHit) {
    const index = this.search.hits().indexOf(hit);
    this.shell.open('match', { exclusive: 'right', props: { index } });
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
      withSearch(),
      withShell(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './props.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div demoWorkspace *epdfDocumentGate="let document; fallback: loading"></div>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
