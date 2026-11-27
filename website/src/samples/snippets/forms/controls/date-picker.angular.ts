import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { EpdfForm, formatDate, type DatePartsInput } from '@embedpdf/angular/form';
import { Calendar } from './calendar'; // your own

@Component({
  selector: 'app-date-picker',
  imports: [EpdfAnchored, Calendar],
  template: `
    @if (date()) {
      <epdf-anchored [anchor]="anchor()" placement="bottom-start">
        <!-- A press on the calendar leaves the cursor in the field until a day is picked. -->
        <div (mousedown)="$event.preventDefault()">
          <app-calendar (pick)="pick($event)" />
        </div>
      </epdf-anchored>
    }
  `,
})
export class DatePicker {
  private readonly form = inject(EpdfForm);
  private readonly focus = toSignal(this.form.focusChanged$, { initialValue: null });
  protected readonly anchor = this.form.widgetAnchorOf(() => this.focus()?.widget ?? null);

  /** The date field the cursor is in, with the pattern its format asks for. */
  protected readonly date = computed(() => {
    const field = this.focus()?.field;
    const format = field && 'format' in field ? field.format : null;
    return field && format?.kind === 'date' ? { ref: field.ref, pattern: format.pattern } : null;
  });

  protected pick(day: DatePartsInput) {
    const date = this.date();
    if (!date) return;
    // A text box writes what was typed when the cursor leaves it: the picked day goes in after.
    (document.activeElement as HTMLElement | null)?.blur();
    void this.form.setValue(date.ref, { value: formatDate(day, date.pattern) });
  }
}
