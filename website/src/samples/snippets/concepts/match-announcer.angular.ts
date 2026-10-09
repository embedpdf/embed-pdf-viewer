import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfSearch } from '@embedpdf/angular/search';

@Component({
  selector: 'app-match-announcer',
  template: '',
})
export class MatchAnnouncer {
  private readonly announcer = inject(LiveAnnouncer);
  private readonly search = inject(EpdfSearch);

  constructor() {
    this.search.completed$
      .pipe(takeUntilDestroyed())
      .subscribe(({ hitCount }) => this.announcer.announce(`${hitCount} matches`));
  }
}
