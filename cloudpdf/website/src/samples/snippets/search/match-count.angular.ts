import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EpdfSearch } from '@embedpdf/angular/search';

@Component({
  selector: 'app-match-count',
  template: `<p aria-live="polite">{{ message() }}</p>`,
})
export class MatchCount {
  private readonly search = inject(EpdfSearch);

  protected readonly message = toSignal(
    this.search.completed$.pipe(map(({ hitCount }) => `${hitCount} matches`)),
    { initialValue: '' },
  );
}
