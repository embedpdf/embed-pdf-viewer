import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSearch, EpdfSearchLayer, withSearch } from '@embedpdf/angular/search';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const colors = ['#ffd500', '#7dd3fc', '#86efac'];

@Component({
  selector: 'demo-search-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <input
        #field
        class="field"
        type="search"
        aria-label="Search"
        [value]="text()"
        (input)="text.set(field.value)"
      />
      <!-- The data to show: signals, which update only what reads them. -->
      <output class="readout">
        @if (search.hitCount() > 0) {
          {{ search.activeHitIndex() + 1 }} of {{ search.hitCount() }}
        } @else {
          No matches
        }
      </output>
      <!-- The API: what search can do. -->
      <button type="button" class="button" (click)="search.nextHit()">Next</button>
      <!-- The settings: a signal too, so the pressed swatch follows the highlight color. -->
      @for (swatch of colors; track swatch) {
        <button
          type="button"
          class="swatch"
          [attr.aria-label]="'Highlight in ' + swatch"
          [attr.aria-pressed]="search.settings().highlight.color === swatch"
          [style.background]="swatch"
          (click)="search.updateSettings({ highlight: { color: swatch } })"
        ></button>
      }
      <button type="button" class="button" (click)="search.resetSettings()">Reset</button>
    </div>
    <p class="announcement" aria-live="polite">{{ announcement() }}</p>
  `,
})
export class SearchBox {
  // One service for everything: the API, the data, the events and the settings.
  protected readonly search = inject(EpdfSearch);
  protected readonly colors = colors;
  protected readonly text = signal('PDF');
  protected readonly announcement = signal('');

  constructor() {
    // A call to your function when something happens: an RxJS stream.
    this.search.completed$
      .pipe(takeUntilDestroyed())
      .subscribe(({ hitCount }) =>
        this.announcement.set(`The search finished with ${hitCount} matches.`),
      );

    effect(() => {
      const text = this.text();
      void this.search.search({ text });
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
    EpdfSearchLayer,
    SearchBox,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withSearch(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './hooks.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-search-box />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-search-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Opening…</p></ng-template>
  `,
})
export class App {}
