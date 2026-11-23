import { Component, effect, inject, input } from '@angular/core';
import { EpdfForm, type FormGroupInput } from '@embedpdf/angular/form';

/** Render it where the document shows, so every document you open gets its own list. */
@Component({ selector: 'app-signers', template: '' })
export class Signers {
  readonly signers = input.required<FormGroupInput[]>();

  private readonly form = inject(EpdfForm);

  constructor() {
    effect(() => this.form.setGroups(this.signers()));
  }
}
