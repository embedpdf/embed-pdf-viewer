import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injectable,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import {
  EpdfActions,
  withActions,
  withActionsUi,
  type PdfNamedAction,
} from '@embedpdf/angular/actions';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const VERBS: ReadonlyArray<[PdfNamedAction, string]> = [
  ['FirstPage', '⇤ First'],
  ['PrevPage', '‹ Previous'],
  ['NextPage', 'Next ›'],
  ['LastPage', 'Last ⇥'],
  ['Print', 'Print'],
];

/** What the last action did. */
@Injectable()
export class LastRun {
  readonly text = signal<string | null>(null);
}

// The viewer actions a PDF's buttons name, run from your own buttons.
@Component({
  selector: 'demo-named-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      @for (verb of verbs; track verb[0]) {
        <button
          type="button"
          class="button"
          [disabled]="!actions.canExecuteNamed(verb[0])"
          (click)="run(verb[0])"
        >
          {{ verb[1] }}
        </button>
      }
      <span class="spacer"></span>
      <output class="readout">
        Page {{ stage().currentPageIndex() + 1 }} of {{ stage().pageCount() }}
        @if (ran.text(); as text) {
          <span class="ran"> · {{ text }}</span>
        }
      </output>
    </div>
  `,
})
export class NamedActions {
  readonly stage = input.required<EpdfStage>();
  protected readonly actions = inject(EpdfActions);
  protected readonly ran = inject(LastRun);
  protected readonly verbs = VERBS;

  constructor() {
    // On load, as if a "Last page" button in the PDF was clicked. Running it twice changes nothing.
    void this.actions
      .executeNamed('LastPage')
      .then(({ status }) => this.ran.text.set(`LastPage: ${status}`));
  }

  protected async run(name: PdfNamedAction) {
    const { status } = await this.actions.executeNamed(name);
    if (name !== 'Print') this.ran.text.set(`${name}: ${status}`);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, NamedActions],
  providers: [
    LastRun,
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withActions(),
      // Print goes to your UI adapter. This one says so, instead of opening the browser's print dialog.
      withActionsUi(() => {
        const ran = inject(LastRun);
        return { print: () => ran.text.set('Print: your print handler ran') };
      }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './run-from-code.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-named-actions [stage]="stage" />
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
