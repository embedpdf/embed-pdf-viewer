import { Injectable, inject } from '@angular/core';
import { EpdfSearch } from '@embedpdf/angular/search';

/** Provide it next to the viewer: `providers: [provideEmbedPdf(…), SearchShortcuts]`. */
@Injectable()
export class SearchShortcuts {
  private readonly search = inject(EpdfSearch);

  handleKey(event: KeyboardEvent) {
    if (event.key === 'F3') this.search.nextHit();
  }
}
