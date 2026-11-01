import { useState } from 'react';
import {
  PDFViewer,
  Panel,
  Region,
  ToolbarItem,
  useCommand,
  type Viewer,
  type ViewerConfig,
  type ViewerPlugins,
} from '@cloudpdf/viewer-react';

import './kiosk.css';

const forms = { grant: 'shr_eBRW5E3MpolzD8G36Alp30EF' };

type Form = ViewerPlugins['form'];

/** A question on the form: its field's name, and what the form calls it. */
interface Question {
  readonly name: string;
  readonly label: string;
}

/** How far along the form is: how many questions are required, and which of them are empty. */
interface Answers {
  readonly required: number;
  readonly missing: readonly Question[];
}

const WELCOME = 'Tap a box to answer it, or tap Next field.';

/** People fill in the form, and nothing else changes it. */
const FILLING_ONLY = { except: ['forms.filling'] };

/** The kinds of field people answer: not buttons or signatures. */
const ANSWERABLE = new Set(['text', 'checkbox', 'radio', 'combobox', 'listbox']);

const ICONS: Record<string, string[]> = {
  next: ['M5 12l14 0', 'M13 18l6 -6', 'M13 6l6 6'],
  clear: [
    'M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3',
    'M18 13.3l-6.3 -6.3',
  ],
  done: ['M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M9 12l2 2l4 -4'],
};

const questionOf = (field: { name: string; alternateName: string | null }): Question => ({
  name: field.name,
  label: field.alternateName ?? field.name,
});

/** Whether a value from `exportValues()` is an answer: text, a choice, a ticked box. */
const isAnswer = (value: unknown) => (Array.isArray(value) ? value.length > 0 : Boolean(value));

const answersOf = (form: Form): Answers => ({
  required: form.list().filter((field) => field.required).length,
  missing: form.validate().missing.map(questionOf),
});

/** The first field after `after` with no answer yet, in the form's order, then from the top. */
function nextEmpty(form: Form, after: string | null) {
  const values = form.exportValues();
  const fields = form.list().filter((field) => ANSWERABLE.has(field.family) && !field.readOnly);
  const start = fields.findIndex((field) => field.name === after) + 1;
  return [...fields.slice(start), ...fields.slice(0, start)].find(
    (field) => !isAnswer(values[field.name]),
  );
}

/** Scroll to a field, so it sits a third of the way down. */
function reveal(viewer: Viewer, name: string) {
  const form = viewer.get('form');
  const box = form.list({ name })[0]?.widgets[0];
  const widget = box ? form.getWidget(box) : null;
  if (widget) {
    viewer.get('stage').reveal(widget.page, {
      rect: widget.rect,
      anchor: { y: 0.3 },
      behavior: 'smooth',
    });
  }
}

/**
 * The front desk's viewer: the form, a header and three big buttons, nothing else. `say` writes
 * the header's line; `setSent` says the form is done, which locks it until Clear.
 */
function kioskConfig(say: (line: string) => void, setSent: (sent: boolean) => void): ViewerConfig {
  let last: string | null = null; // the field Next field went to
  let sent = false; // whether the form is done: it's locked until Clear
  const send = (done: boolean) => {
    sent = done;
    setSent(done);
  };
  return {
    theme: {
      preference: 'light',
      accent: '#b5500e',
      tokens: {
        background: '#f3e7dc',
        surface: '#fffaf5',
        'surface-raised': '#fffaf5',
        text: '#2b1c12',
        'text-muted': '#6e5848',
        border: '#e3d5c9',
        hover: '#fdefe1',
        canvas: '#efe2d3',
        radius: '14px',
        font: "ui-rounded, 'SF Pro Rounded', 'Segoe UI', system-ui, sans-serif",
      },
    },
    // No opening, saving or printing files, no search, and no selecting text: a long press is
    // only ever a tap on the form.
    disable: ['documents', 'search', 'text'],
    plugins: {
      stage: { zoom: { mode: 'fit-width' } },
      form: { fields: { background: 'rgb(253 239 225 / 0.9)' } },
    },
    icons: ICONS,
    commands: [
      {
        id: 'kiosk:next',
        label: 'Next field',
        icon: 'next',
        run: ({ viewer }) => {
          if (sent) return say('This form is done. Tap Clear for the next person.');
          const field = nextEmpty(viewer.get('form'), last);
          if (!field) return say('Every question has an answer. Tap Done.');
          last = field.name;
          reveal(viewer, field.name);
          say(`Next: ${questionOf(field).label}`);
        },
      },
      {
        id: 'kiosk:clear',
        label: 'Clear',
        icon: 'clear',
        enabled: ({ get }) => Object.values(get('form').exportValues()).some(isAnswer),
        run: async ({ viewer }) => {
          send(false);
          await viewer.get('form').reset();
          viewer.get('stage').goToPage(0);
          last = null;
          say('Cleared, ready for the next person.');
        },
      },
      {
        id: 'kiosk:done',
        label: 'Done',
        icon: 'done',
        run: ({ viewer }) => {
          const { valid } = viewer.get('form').validate();
          send(valid);
          say(valid ? 'All done. Thank you!' : 'A few answers are still missing.');
          viewer.get('shell').open('kiosk-check');
        },
      },
    ],
    // A layout of its own: one bar at the bottom for the buttons, and the check as a sheet.
    layout: {
      bars: {
        kiosk: { place: 'bottom', center: [[{ custom: 'kiosk-actions' }]] },
      },
      panels: {
        'kiosk-check': { title: 'Your application', present: 'sheet', resizable: false },
      },
    },
  };
}

/** One of the kiosk's commands, drawn big enough for a finger. */
function BigButton({ id, primary = false }: { id: string; primary?: boolean }) {
  const command = useCommand(id);
  return (
    <button
      type="button"
      className={primary ? 'kiosk-button primary' : 'kiosk-button'}
      disabled={!command.enabled}
      onClick={() => command.run()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {ICONS[command.icon ?? '']?.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      {command.label}
    </button>
  );
}

export default function App() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [line, setLine] = useState(WELCOME);
  const [sent, setSent] = useState(false);
  const [config] = useState(() => kioskConfig(setLine, setSent));

  // Follow the form as people fill it in, for the header and the check.
  const onReady = (viewer: Viewer) => {
    setViewer(viewer);
    viewer.documents.onOpened(({ documentId }) => {
      const form = viewer.forDocument(documentId).get('form');
      setAnswers(answersOf(form));
      viewer.watch(
        () => form.list(),
        () => setAnswers(answersOf(form)),
      );
    });
  };

  /** Close the check, and go to a question it lists. */
  const pick = ({ name, label }: Question) => {
    if (!viewer) return;
    viewer.get('shell').close('kiosk-check');
    reveal(viewer, name);
    setLine(`Next: ${label}`);
  };

  const answered = answers ? answers.required - answers.missing.length : 0;
  return (
    <PDFViewer
      src={forms}
      {...config}
      readOnly={sent ? true : FILLING_ONLY}
      onReady={onReady}
      style={{ height: '100%' }}
    >
      <Region name="header">
        <header className="kiosk-header">
          <p className="kiosk-brand">
            Lanternfield <small>Front desk</small>
          </p>
          <p className="kiosk-line" aria-live="polite">
            {line}
          </p>
          {answers && answers.required > 0 && (
            <p className={answers.missing.length ? 'kiosk-progress' : 'kiosk-progress complete'}>
              {answered} of {answers.required} required
            </p>
          )}
        </header>
      </Region>
      <ToolbarItem id="kiosk-actions">
        <div className="kiosk-actions">
          <BigButton id="kiosk:next" />
          <BigButton id="kiosk:clear" />
          <BigButton id="kiosk:done" primary />
        </div>
      </ToolbarItem>
      <Panel id="kiosk-check">
        {sent ? (
          <div className="kiosk-check">
            <h2>Thank you!</h2>
            <p>Your application is complete. Please hand the tablet back to the front desk.</p>
          </div>
        ) : (
          <div className="kiosk-check">
            <h2>Almost there</h2>
            <p>These questions still need an answer:</p>
            <ul>
              {answers?.missing.map((question) => (
                <li key={question.name}>
                  <button type="button" onClick={() => pick(question)}>
                    {question.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </PDFViewer>
  );
}
