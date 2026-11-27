import { Component, inject } from '@angular/core';
import { EpdfForm } from '@embedpdf/angular/form';

/** Render it where the document shows: it fills in what the app knows when the person starts. */
@Component({ selector: 'app-prefill', template: '' })
export class Prefill {
  constructor() {
    // A field that has a value is left alone, so a second call writes nothing.
    void inject(EpdfForm).prefill();
  }
}
