import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
  type ActionOrigin,
  type ActionPolicyDecision,
  type PdfActionTree,
} from '@embedpdf/angular/actions';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// A link to a website, as a PDF carries it: what getActionTree() reads from a link.
const websiteLink: PdfActionTree = {
  root: { type: 'uri', subtype: 'URI', uri: 'https://www.embedpdf.com', isMap: false, next: [] },
  incomplete: false,
  warningFlags: 0,
  warnings: [],
};

// The three ways an action can start, each as the context it runs with.
const STARTS: ReadonlyArray<{ label: string; context: ActionContext }> = [
  {
    label: 'A click',
    context: { origin: 'user', source: { kind: 'api' }, event: { scope: 'activate' } },
  },
  {
    label: 'The pointer over it',
    context: {
      origin: 'hover',
      source: { kind: 'api' },
      event: { scope: 'annotation', name: 'cursorEnter' },
    },
  },
  {
    label: 'The document opening',
    context: {
      origin: 'lifecycle',
      source: { kind: 'api' },
      event: { scope: 'document', name: 'open' },
    },
  },
];
const RULES: readonly ActionPolicyDecision[] = ['allow', 'adapter', 'report', 'block'];

/** What happened to the link, newest first. */
@Injectable()
export class RunLog {
  readonly lines = signal<string[]>([]);

  note(line: string) {
    this.lines.update((lines) => [line, ...lines].slice(0, 6));
  }
}

// The rules for websites, changed while the app runs, and what happens when the link runs.
@Component({
  selector: 'demo-website-rules',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <ul class="starts">
        @for (start of starts; track start.context.origin) {
          <li class="start">
            <span class="start-label">
              {{ start.label }} <code>{{ start.context.origin }}</code>
            </span>
            <select
              #rule
              class="field"
              [attr.aria-label]="'The rule for ' + start.context.origin"
              (change)="setRule(start.context.origin, rule.value)"
            >
              @for (option of rulesToPick; track option) {
                <option [value]="option" [selected]="option === rules()[start.context.origin]">
                  {{ option }}
                </option>
              }
            </select>
            <button type="button" class="button" (click)="run(start.context)">Run the link</button>
          </li>
        }
      </ul>
      <div class="footer">
        <ol class="log" aria-live="polite">
          @for (line of log.lines(); track $index) {
            <li>{{ line }}</li>
          }
        </ol>
        <button type="button" class="button" (click)="actions.resetSettings()">
          Back to the registered rules
        </button>
      </div>
    </section>
  `,
})
export class WebsiteRules {
  protected readonly actions = inject(EpdfActions);
  protected readonly log = inject(RunLog);
  protected readonly starts = STARTS;
  protected readonly rulesToPick = RULES;
  protected readonly rules = computed(() => this.actions.settings().policy.uri);

  constructor() {
    this.actions.diagnosticReported$
      .pipe(takeUntilDestroyed())
      .subscribe(({ code, action }) => this.log.note(`The ${action} action was not run: ${code}`));

    // One click on load, so the log shows what a click does.
    this.run(STARTS[0].context);
  }

  protected run(context: ActionContext) {
    void this.actions.execute(websiteLink, context);
  }

  protected setRule(origin: ActionOrigin, rule: string) {
    this.actions.updateSettings({
      policy: { uri: { [origin]: rule as ActionPolicyDecision } },
    });
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, WebsiteRules],
  providers: [
    RunLog,
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      // Websites open only on a click, as the page's example registers it.
      withActions({
        policy: { uri: { user: 'adapter', hover: 'block', lifecycle: 'block' } },
      }),
      // Instead of opening a tab, the adapter notes the website it was given.
      withActionsUi(() => {
        const log = inject(RunLog);
        return { openUri: (uri) => log.note(`Your adapter got ${uri}`) };
      }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './rules.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-website-rules *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
