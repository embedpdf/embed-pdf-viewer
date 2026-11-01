import { Component, signal, ViewEncapsulation } from '@angular/core';
import {
  EpdfCommand,
  EpdfPanel,
  EpdfPdfViewer,
  EpdfRegion,
  EpdfToolbarItem,
  type Viewer,
  type ViewerConfig,
  type ViewerPlugins,
} from '@embedpdf/viewer-angular';

const forms = '/pdfs/forms.pdf';

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

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer, EpdfRegion, EpdfToolbarItem, EpdfPanel, EpdfCommand],
  styleUrl: './kiosk.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <epdf-pdf-viewer
      [src]="forms"
      [config]="config"
      [readOnly]="sent() ? true : fillingOnly"
      (ready)="onReady($event)"
      style="height: 100%"
    >
      <ng-template epdfRegion="header">
        <header class="kiosk-header">
          <p class="kiosk-brand">Lanternfield <small>Front desk</small></p>
          <p class="kiosk-line" aria-live="polite">{{ line() }}</p>
          @if (answers(); as answers) {
            @if (answers.required > 0) {
              <p class="kiosk-progress" [class.complete]="!answers.missing.length">
                {{ answers.required - answers.missing.length }} of {{ answers.required }} required
              </p>
            }
          }
        </header>
      </ng-template>
      <ng-template epdfToolbarItem="kiosk-actions">
        <div class="kiosk-actions">
          <!-- The kiosk's commands, drawn big enough for a finger. -->
          @for (id of buttons; track id) {
            <button
              type="button"
              class="kiosk-button"
              [class.primary]="id === 'kiosk:done'"
              [epdfCommand]="id"
              #command="epdfCommand"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                @for (d of icons[command.icon() ?? ''] ?? []; track d) {
                  <path [attr.d]="d" />
                }
              </svg>
              {{ command.label() }}
            </button>
          }
        </div>
      </ng-template>
      <ng-template epdfPanel="kiosk-check">
        @if (sent()) {
          <div class="kiosk-check">
            <h2>Thank you!</h2>
            <p>Your application is complete. Please hand the tablet back to the front desk.</p>
          </div>
        } @else {
          <div class="kiosk-check">
            <h2>Almost there</h2>
            <p>These questions still need an answer:</p>
            <ul>
              @for (question of answers()?.missing ?? []; track question.name) {
                <li>
                  <button type="button" (click)="pick(question)">{{ question.label }}</button>
                </li>
              }
            </ul>
          </div>
        }
      </ng-template>
    </epdf-pdf-viewer>
  `,
})
export class App {
  readonly forms = forms;
  readonly fillingOnly = FILLING_ONLY;
  readonly icons = ICONS;
  readonly buttons = ['kiosk:next', 'kiosk:clear', 'kiosk:done'];

  readonly viewer = signal<Viewer | null>(null);
  readonly answers = signal<Answers | null>(null);
  /** The header's line. */
  readonly line = signal('Tap a box to answer it, or tap Next field.');
  /** Whether the form is complete and handed in: it's locked until Clear. */
  readonly sent = signal(false);
  private last: string | null = null; // the field Next field went to

  // The front desk's viewer: the form, a header and three big buttons, nothing else.
  readonly config: ViewerConfig = {
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
          if (this.sent())
            return this.line.set('This form is done. Tap Clear for the next person.');
          const field = nextEmpty(viewer.get('form'), this.last);
          if (!field) return this.line.set('Every question has an answer. Tap Done.');
          this.last = field.name;
          reveal(viewer, field.name);
          this.line.set(`Next: ${questionOf(field).label}`);
        },
      },
      {
        id: 'kiosk:clear',
        label: 'Clear',
        icon: 'clear',
        enabled: ({ get }) => Object.values(get('form').exportValues()).some(isAnswer),
        run: async ({ viewer }) => {
          this.sent.set(false);
          await viewer.get('form').reset();
          viewer.get('stage').goToPage(0);
          this.last = null;
          this.line.set('Cleared, ready for the next person.');
        },
      },
      {
        id: 'kiosk:done',
        label: 'Done',
        icon: 'done',
        run: ({ viewer }) => {
          const { valid } = viewer.get('form').validate();
          this.sent.set(valid);
          this.line.set(valid ? 'All done. Thank you!' : 'A few answers are still missing.');
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

  /** Follow the form as people fill it in, for the header and the check. */
  onReady(viewer: Viewer) {
    this.viewer.set(viewer);
    viewer.documents.onOpened(({ documentId }) => {
      const form = viewer.forDocument(documentId).get('form');
      this.answers.set(answersOf(form));
      viewer.watch(
        () => form.list(),
        () => this.answers.set(answersOf(form)),
      );
    });
  }

  /** Close the check, and go to a question it lists. */
  pick({ name, label }: Question) {
    const viewer = this.viewer();
    if (!viewer) return;
    viewer.get('shell').close('kiosk-check');
    reveal(viewer, name);
    this.line.set(`Next: ${label}`);
  }
}
