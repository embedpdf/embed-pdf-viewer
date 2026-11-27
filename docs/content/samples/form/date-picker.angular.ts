import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { EpdfForm, EpdfFormLayer, formatDate, parseDate, withForm } from '@embedpdf/angular/form';
import type { DatePartsInput } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

// [!doc-source invoice]
const invoice = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/invoice.pdf');
  return { kind: 'bytes', id: 'invoice', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Today, as the calendar counts: a year, a month from 1, a day. */
function today(): DatePartsInput {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** The days of a month, after the blanks that put the 1st under its weekday (Monday first). */
function daysOf(year: number, month: number): (number | null)[] {
  const blanks = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const count = new Date(year, month, 0).getDate();
  return [...Array<null>(blanks).fill(null), ...Array.from({ length: count }, (_, at) => at + 1)];
}

/** A month of days. `shown` is the day the field holds, when it holds one. */
@Component({
  selector: 'demo-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="calendar" role="group" aria-label="Pick a date">
      <div class="calendar-bar">
        <button type="button" class="calendar-turn" aria-label="Month before" (click)="turn(-1)">
          ‹
        </button>
        <span class="calendar-month">{{ months[month().month - 1] }} {{ month().year }}</span>
        <button type="button" class="calendar-turn" aria-label="Month after" (click)="turn(1)">
          ›
        </button>
      </div>
      <div class="calendar-days">
        @for (day of days(); track $index) {
          @if (day === null) {
            <span></span>
          } @else {
            <button
              type="button"
              class="calendar-day"
              [attr.aria-pressed]="isShown(day)"
              (click)="pick.emit({ year: month().year, month: month().month, day: day })"
            >
              {{ day }}
            </button>
          }
        }
      </div>
    </div>
  `,
})
export class Calendar {
  readonly shown = input<DatePartsInput | null>(null);
  readonly pick = output<DatePartsInput>();

  protected readonly months = MONTHS;
  /** The month on show: the shown day's, or this month, until an arrow turns it. */
  protected readonly month = linkedSignal(() => {
    const start = this.shown() ?? today();
    return { year: start.year, month: start.month };
  });
  protected readonly days = computed(() => daysOf(this.month().year, this.month().month));

  protected turn(by: number) {
    const { year, month } = this.month();
    const next = new Date(year, month - 1 + by, 1);
    this.month.set({ year: next.getFullYear(), month: next.getMonth() + 1 });
  }

  protected isShown(day: number) {
    const shown = this.shown();
    const { year, month } = this.month();
    return shown?.year === year && shown.month === month && shown.day === day;
  }
}

/** A calendar next to the date field the cursor is in. */
@Component({
  selector: 'demo-date-picker',
  imports: [EpdfAnchored, Calendar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (date(); as date) {
      <epdf-anchored [anchor]="anchor()" placement="bottom-start" [gap]="6">
        <!-- A press on the calendar leaves the cursor in the field until a day is picked. -->
        <div (mousedown)="$event.preventDefault()">
          <demo-calendar [shown]="date.shown" (pick)="pick($event)" />
        </div>
      </epdf-anchored>
    }
  `,
})
export class DatePicker {
  private readonly form = inject(EpdfForm);
  private readonly focus = toSignal(this.form.focusChanged$, { initialValue: null });
  protected readonly anchor = this.form.widgetAnchorOf(() => this.focus()?.widget ?? null);

  // A date field says so in its format, read from the PDF.
  protected readonly date = computed(() => {
    const field = this.focus()?.field;
    const format = field && 'format' in field ? field.format : null;
    if (!field || field.kind !== 'text' || format?.kind !== 'date') return null;
    return {
      ref: field.ref,
      pattern: format.pattern,
      shown: parseDate(field.value, format.pattern, today()),
    };
  });

  protected pick(day: DatePartsInput) {
    const date = this.date();
    if (!date) return;
    // A text box writes what was typed when the cursor leaves it: the picked day goes in after.
    (document.activeElement as HTMLElement | null)?.blur();
    void this.form.setValue(date.ref, { value: formatDate(day, date.pattern) });
  }
}

/** What the form refused last, so a mistyped date says why. */
@Component({
  selector: 'demo-refused',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <output class="readout">{{ refused() ?? 'Click the order date, or type one.' }}</output>
    </div>
  `,
})
export class Refused {
  protected readonly refused = signal<string | null>(null);

  constructor() {
    const form = inject(EpdfForm);
    form.validationRejected$
      .pipe(takeUntilDestroyed())
      .subscribe(({ issues }) =>
        this.refused.set(issues[0]?.message ?? 'The form refused that value.'),
      );
    form.valueChanged$.pipe(takeUntilDestroyed()).subscribe(() => this.refused.set(null));
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfFormLayer,
    Refused,
    DatePicker,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: invoice }] },
      withStage(),
      withRender(),
      withInteraction(),
      // No JavaScript here: the form plugin checks a typed date against the field's pattern itself.
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './date-picker.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-refused />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-form-layer />
        </ng-template>
        <demo-date-picker />
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
