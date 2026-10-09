import { Component, inject } from '@angular/core';
import { EpdfSearch } from '@embedpdf/angular/search';

@Component({
  selector: 'app-search-results',
  template: `
    <ol>
      @for (hit of search.hits(); track $index) {
        <li>
          <button type="button" (click)="search.goToHit(hit)">
            Page {{ hit.pageIndex + 1 }}: …{{ hit.snippet?.before }}
            <mark>{{ hit.snippet?.match }}</mark>
            {{ hit.snippet?.after }}…
          </button>
        </li>
      }
    </ol>
  `,
})
export class SearchResults {
  protected readonly search = inject(EpdfSearch);
}
