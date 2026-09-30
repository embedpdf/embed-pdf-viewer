import { Directive, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';
import { toast } from './toast'; // your own

@Directive({ selector: '[appRemoteChanges]' })
export class RemoteChanges {
  constructor() {
    inject(EpdfAnnotation)
      .updated$.pipe(
        filter(({ origin }) => origin.kind === 'remote'),
        takeUntilDestroyed(),
      )
      .subscribe(({ annotation }) => toast(`${annotation.author} changed a comment`));
  }
}
