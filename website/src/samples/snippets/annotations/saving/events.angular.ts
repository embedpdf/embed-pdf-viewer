import { Directive, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';

// <div appActivityLog>…</div>, on any element under the viewer's providers
@Directive({ selector: '[appActivityLog]' })
export class ActivityLog {
  constructor() {
    inject(EpdfAnnotation)
      .created$.pipe(takeUntilDestroyed())
      .subscribe(({ annotation, origin }) => {
        console.log(`${annotation.author} added a ${annotation.subtype}`);
      });
  }
}
