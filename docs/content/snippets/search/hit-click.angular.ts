import { Component, inject } from '@angular/core';
import { EpdfSearch, EpdfSearchLayer } from '@embedpdf/angular/search';

@Component({
  selector: 'app-page-matches',
  imports: [EpdfSearchLayer],
  template: `<epdf-search-layer (hitClick)="search.goToHit($event)" />`,
})
export class PageMatches {
  protected readonly search = inject(EpdfSearch);
}
