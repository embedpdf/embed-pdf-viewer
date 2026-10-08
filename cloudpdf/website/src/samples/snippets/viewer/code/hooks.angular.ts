import { Component, inject } from '@angular/core';
import { EpdfSearch } from '@embedpdf/angular/search';

// A search box of your own, in the viewer's header. The service is the headless one.
@Component({
  selector: 'app-header-search',
  template: `
    <form (submit)="$event.preventDefault()">
      <input type="search" placeholder="Search" (input)="search.search({ text: $any($event.target).value })" />
      @if (search.hitCount() > 0) {
        <span>{{ search.activeHitIndex() + 1 }} of {{ search.hitCount() }}</span>
      }
      <button type="button" (click)="search.nextHit()">Next</button>
    </form>
  `,
})
export class HeaderSearch {
  protected readonly search = inject(EpdfSearch);
}
