import { Component, inject } from '@angular/core';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfSearch, EpdfSearchLayer } from '@embedpdf/angular/search';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-search',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSearchLayer],
  template: `
    <form (submit)="$event.preventDefault()">
      <input #query (input)="search.search({ text: query.value })" />
      @if (search.status() === 'searching') {
        <span>Searching…</span>
      }
      @if (search.hitCount() > 0) {
        <span>{{ search.activeHitIndex() + 1 }} of {{ search.hitCount() }}</span>
      }
      <button type="button" (click)="search.previousHit()">↑</button>
      <button type="button" (click)="search.nextHit()">↓</button>
    </form>

    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-search-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class SearchPage {
  protected readonly search = inject(EpdfSearch);
}
