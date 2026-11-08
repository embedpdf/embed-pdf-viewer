import { useState } from 'react';
import {
  PDFViewer,
  Panel,
  Region,
  type Viewer,
  type ViewerConfig,
  type ViewerPlugins,
} from '@embedpdf/viewer-react';

import './kiosk.css';

const forms = 'https://www.embedpdf.com/pdfs/forms.pdf';

type Form = ViewerPlugins['form'];

/** A question on the form: one of its fields. */
type Question = ReturnType<Form['list']>[number];

/** How far along the form is: how many questions are required, and which of them are empty. */
interface Answers {
  readonly required: number;
  readonly missing: readonly Question[];
}

const WELCOME = 'Tap a box to answer it, or tap Next field.';

/** People fill in the form, and nothing else changes it. */
const FILLING_ONLY = { except: ['forms.filling'] };

/** What the form calls a question: its tooltip, else its field's name. */
const labelOf = (question: Question) => question.alternateName ?? question.name;

/** Whether a value from `exportValues()` is an answer: text, a choice, a ticked box. */
const isAnswer = (value: unknown) => (Array.isArray(value) ? value.length > 0 : Boolean(value));

const answersOf = (form: Form): Answers => ({
  required: form.list().filter((field) => field.required).length,
  missing: form.validate().missing,
});

// What the commands read from the app: whether the form is done, and how to change that and the
// header's line.
interface Kiosk {
  /** Whether the form is complete and handed in: it's locked until Clear. */
  sent: boolean;
  setSent(sent: boolean): void;
  /** Write the header's line. */
  say(line: string): void;
}

// The front desk's viewer: the form, a header and three buttons, nothing else. A constant: the
// commands read the app from `appState`, so they never hold an old value.
const config: ViewerConfig<Kiosk> = {
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
  // Every button and menu row a finger's size, even with a mouse plugged in.
  touch: true,
  // A kiosk fills in forms all day and never keeps them: leaving the page asks nothing.
  warnBeforeLeaving: false,
  // No opening, saving or printing files, no search, and no selecting text: a long press is only
  // ever a tap on the form.
  features: { documents: false, search: false, text: false },
  plugins: {
    stage: { zoom: { mode: 'fit-width' } },
    form: { fields: { background: 'rgb(253 239 225 / 0.9)' } },
  },
  icons: {
    next: ['M5 12l14 0', 'M13 18l6 -6', 'M13 6l6 6'],
    clear: [
      'M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3',
      'M18 13.3l-6.3 -6.3',
    ],
    done: ['M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M9 12l2 2l4 -4'],
  },
  commands: [
    {
      id: 'kiosk:next',
      label: 'Next field',
      icon: 'next',
      // The header names the field once the cursor is in it.
      run: ({ appState, viewer }) => {
        if (appState.sent) {
          appState.say('This form is done. Tap Clear for the next person.');
        } else if (!viewer.get('form').focusNext({ empty: true, wrap: true })) {
          appState.say('Every question has an answer. Tap Done.');
        }
      },
    },
    {
      id: 'kiosk:clear',
      label: 'Clear',
      icon: 'clear',
      enabled: ({ get }) => Object.values(get('form').exportValues()).some(isAnswer),
      run: async ({ appState, viewer }) => {
        appState.setSent(false);
        await viewer.get('form').reset();
        viewer.get('stage').goToPage(0);
        appState.say('Cleared, ready for the next person.');
      },
    },
    {
      id: 'kiosk:done',
      label: 'Done',
      icon: 'done',
      run: ({ appState, viewer }) => {
        const { valid } = viewer.get('form').validate();
        appState.setSent(valid);
        appState.say(valid ? 'All done. Thank you!' : 'A few answers are still missing.');
        viewer.get('shell').open('kiosk-check');
      },
    },
  ],
  // A layout of its own: one bar at the bottom with the three buttons and their labels, Done
  // filled in, and the check as a sheet.
  layout: {
    bars: {
      kiosk: {
        place: 'bottom',
        center: [
          [
            { command: 'kiosk:next', variants: ['icon+label', 'icon'] },
            { command: 'kiosk:clear', variants: ['icon+label', 'icon'] },
            { command: 'kiosk:done', emphasis: 'primary', variants: ['icon+label', 'icon'] },
          ],
        ],
      },
    },
    panels: {
      'kiosk-check': { title: 'Your application', present: 'sheet', resizable: false },
    },
  },
};

export default function App() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [line, setLine] = useState(WELCOME);
  const [sent, setSent] = useState(false);

  const onReady = (viewer: Viewer) => {
    setViewer(viewer);
    // The form is the document's: `watch` waits for it to open, then follows it as people fill
    // it in, for the header's count and the check.
    viewer.watch(
      () => viewer.get('form').list(),
      () => setAnswers(answersOf(viewer.get('form'))),
      { immediate: true },
    );
    // The header's line names the question the cursor is in, whether Next field or a tap put it
    // there.
    viewer.documents.onOpened(() => {
      viewer.get('form').onFocusChanged(({ field }) => {
        if (field) setLine(`Answering: ${labelOf(field)}`);
      });
    });
  };

  /** Close the check, and put the cursor in a question it lists. */
  const pick = (question: Question) => {
    if (!viewer) return;
    viewer.get('shell').close('kiosk-check');
    viewer.get('form').focus(question.ref);
  };

  const answered = answers ? answers.required - answers.missing.length : 0;
  return (
    <PDFViewer
      src={forms}
      {...config}
      appState={{ sent, setSent, say: setLine }}
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
                    {labelOf(question)}
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
