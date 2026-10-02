import { Component, DestroyRef, inject } from '@angular/core';
import {
  EpdfStamp,
  indexedDbByteStore,
  persistStampLibraries,
  restoreStampLibraries,
} from '@embedpdf/angular/stamp';

const store = indexedDbByteStore('stamps');

@Component({
  selector: 'app-stamp-libraries',
  template: `
    <ul>
      @for (library of stamp.libraries(); track library.id) {
        <li>{{ library.name }}</li>
      }
    </ul>
  `,
})
export class StampLibraries {
  protected readonly stamp = inject(EpdfStamp);

  constructor() {
    void restoreStampLibraries(this.stamp, store); // import every stored library
    const stop = persistStampLibraries(this.stamp, store, { except: ['embedpdf-standard'] });
    inject(DestroyRef).onDestroy(stop);
  }
}
