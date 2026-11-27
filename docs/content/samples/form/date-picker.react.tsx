import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { Anchored } from '@embedpdf/react/anchored';
import {
  FormLayer,
  formatDate,
  formPlugin,
  parseDate,
  useForm,
  useFormEvent,
  useFormWidgetAnchor,
} from '@embedpdf/react/form';
import type { DatePartsInput, FormFocusChangedEvent } from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './date-picker.css';

const engine = localEngine();
// No JavaScript here: the form plugin checks a typed date against the field's pattern itself.
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

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
function Calendar({
  shown,
  onPick,
}: {
  shown: DatePartsInput | null;
  onPick: (day: DatePartsInput) => void;
}) {
  const start = shown ?? today();
  const [{ year, month }, setMonth] = useState({ year: start.year, month: start.month });
  const turn = (by: number) => {
    const next = new Date(year, month - 1 + by, 1);
    setMonth({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };

  return (
    <div className="calendar" role="group" aria-label="Pick a date">
      <div className="calendar-bar">
        <button
          type="button"
          className="calendar-turn"
          aria-label="Month before"
          onClick={() => turn(-1)}
        >
          ‹
        </button>
        <span className="calendar-month">
          {MONTHS[month - 1]} {year}
        </span>
        <button
          type="button"
          className="calendar-turn"
          aria-label="Month after"
          onClick={() => turn(1)}
        >
          ›
        </button>
      </div>
      <div className="calendar-days">
        {daysOf(year, month).map((day, at) =>
          day === null ? (
            <span key={at} />
          ) : (
            <button
              key={at}
              type="button"
              className="calendar-day"
              aria-pressed={shown?.year === year && shown.month === month && shown.day === day}
              onClick={() => onPick({ year, month, day })}
            >
              {day}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/** A calendar next to the date field the cursor is in. */
function DatePicker() {
  const form = useForm();
  const [focus, setFocus] = useState<FormFocusChangedEvent | null>(null);
  useFormEvent((form) => form.onFocusChanged, setFocus);
  const anchor = useFormWidgetAnchor(focus?.widget ?? null);

  // A date field says so in its format, read from the PDF.
  const field = focus?.field;
  const format = field && 'format' in field ? field.format : null;
  if (!field || field.kind !== 'text' || format?.kind !== 'date') return null;

  const pick = (day: DatePartsInput) => {
    // A text box writes what was typed when the cursor leaves it: the picked day goes in after.
    (document.activeElement as HTMLElement | null)?.blur();
    void form.setValue(field.ref, { value: formatDate(day, format.pattern) });
  };

  return (
    <Anchored anchor={anchor} placement="bottom-start" gap={6}>
      {/* A press on the calendar leaves the cursor in the field until a day is picked. */}
      <div onMouseDown={(event) => event.preventDefault()}>
        <Calendar
          key={field.name}
          shown={parseDate(field.value, format.pattern, today())}
          onPick={pick}
        />
      </div>
    </Anchored>
  );
}

/** What the form refused last, so a mistyped date says why. */
function Refused() {
  const [refused, setRefused] = useState<string | null>(null);
  useFormEvent(
    (form) => form.onValidationRejected,
    ({ issues }) => setRefused(issues[0]?.message ?? 'The form refused that value.'),
  );
  useFormEvent(
    (form) => form.onValueChanged,
    () => setRefused(null),
  );

  return (
    <div className="toolbar">
      <output className="readout">{refused ?? 'Click the order date, or type one.'}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: invoice }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Refused />
        <Stage className="stage" overlay={<DatePicker />}>
          {() => (
            <>
              <RenderLayer />
              <FormLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
