import { Component, computed, inject } from '@angular/core';
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { EpdfForm } from '@embedpdf/angular/form';

// <app-next-field /> goes inside <epdf-stage>
@Component({
  selector: 'app-next-field',
  imports: [EpdfAnchored],
  template: `
    @if (next(); as field) {
      <epdf-anchored [anchor]="anchor()" placement="left" [gap]="6" pinned>
        <button class="next-field" (click)="form.focus(field.ref)">
          {{ field.kind === 'signature' ? 'Sign' : 'Fill in' }}
        </button>
      </epdf-anchored>
    }
  `,
})
export class NextField {
  protected readonly form = inject(EpdfForm);

  // The next required field that is still empty.
  protected readonly next = computed(() => {
    this.form.fields(); // again when a field is filled in
    return this.form.validate().missing[0] ?? null;
  });
  protected readonly anchor = this.form.widgetAnchorOf(() => {
    const next = this.next();
    return next ? (this.form.getWidgets(next.ref)[0]?.ref ?? null) : null;
  });
}
