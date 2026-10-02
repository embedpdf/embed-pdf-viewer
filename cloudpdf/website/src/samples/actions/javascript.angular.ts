import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injectable,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import {
  EpdfActions,
  withActions,
  withActionsUi,
  type ActionContext,
  type PdfActionTree,
} from '@embedpdf/angular/actions';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// A JavaScript action, as a PDF carries it behind a button or a link.
const script = (code: string): PdfActionTree => ({
  root: { type: 'javascript', subtype: 'JavaScript', script: code, next: [] },
  incomplete: false,
  warningFlags: 0,
  warnings: [],
});
const click: ActionContext = {
  origin: 'user',
  source: { kind: 'api' },
  event: { scope: 'activate' },
};

const GREETING = "app.alert('Hello, ' + identity.name + ' from ' + identity.corporation + '!');";
const MISTAKE = 'app.alrt("typo");';

interface OutputLine {
  kind: 'alert' | 'error';
  text: string;
}

/** What the script said: its alerts and its errors, newest first. */
@Injectable()
export class ScriptOutput {
  readonly lines = signal<OutputLine[]>([]);

  show(kind: OutputLine['kind'], text: string) {
    this.lines.update((lines) => [{ kind, text }, ...lines].slice(0, 5));
  }
}

// Edit the script and run it. Its alerts and its errors show below it.
@Component({
  selector: 'demo-script-console',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <label class="name" for="script">
        Script {{ actions.isScriptingEnabled() ? '' : '(JavaScript is off)' }}
      </label>
      <textarea
        #area
        id="script"
        class="code"
        spellcheck="false"
        rows="3"
        [value]="code()"
        (input)="code.set(area.value)"
      ></textarea>
      <div class="actions">
        <button type="button" class="button primary" (click)="run()">Run</button>
        <button type="button" class="button" (click)="code.set(mistake)">
          A script with a mistake
        </button>
      </div>
      <ol class="output" aria-live="polite">
        @for (line of output.lines(); track $index) {
          <li [class]="line.kind">{{ line.text }}</li>
        }
      </ol>
    </section>
  `,
})
export class ScriptConsole {
  protected readonly actions = inject(EpdfActions);
  protected readonly output = inject(ScriptOutput);
  protected readonly code = signal(GREETING);
  protected readonly mistake = MISTAKE;

  constructor() {
    this.actions.scriptFailed$
      .pipe(takeUntilDestroyed())
      .subscribe(({ error }) => this.output.show('error', error.message));

    // The greeting runs once on load.
    void this.actions.execute(script(GREETING), click);
  }

  protected run() {
    void this.actions.execute(script(this.code()), click);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, ScriptConsole],
  providers: [
    ScriptOutput,
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      // JavaScript on, and two fields scripts often ask for about the user.
      withActions({
        javascript: { enabled: true, identity: { name: 'Dana Smith', corporation: 'Acme' } },
      }),
      // A script's alert goes to your UI adapter: here, a line below the script.
      withActionsUi(() => {
        const output = inject(ScriptOutput);
        return { alert: (message) => output.show('alert', message) };
      }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './javascript.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-script-console *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
