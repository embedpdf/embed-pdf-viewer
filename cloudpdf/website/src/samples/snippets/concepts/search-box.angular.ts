import { Component, inject } from '@angular/core';
import { EpdfSearch } from '@embedpdf/angular/search';

@Component({
  selector: 'app-search-box',
  template: `
    <input #query (input)="search.search({ text: query.value })" />
    <span>{{ search.activeHitIndex() + 1 }} of {{ search.hitCount() }}</span>
    <button (click)="search.nextHit()">Next</button>
  `,
})
export class SearchBox {
  protected readonly search = inject(EpdfSearch);
}
