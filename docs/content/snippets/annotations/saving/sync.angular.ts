import { Directive, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { EpdfAnnotation, annotationKey } from '@embedpdf/angular/annotation';
import { api } from './api'; // your own

@Directive({ selector: '[appSyncToServer]' })
export class SyncToServer {
  constructor() {
    inject(EpdfAnnotation)
      .created$.pipe(
        filter(({ origin }) => origin.kind === 'local'),
        takeUntilDestroyed(),
      )
      .subscribe(({ annotation }) =>
        api.put(`/annotations/${annotationKey(annotation.ref)}`, annotation),
      );
  }
}
