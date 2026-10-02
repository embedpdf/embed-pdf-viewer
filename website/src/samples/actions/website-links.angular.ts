import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injectable,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import {
  EpdfActions,
  withActions,
  withActionsUi,
  type ActionContext,
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
const click: ActionContext = {
  origin: 'user',
  source: { kind: 'api' },
  event: { scope: 'activate' },
};

/** The website the document wants to open, while the user decides. */
@Injectable()
export class LinkPrompt {
  readonly asking = signal<string | null>(null);
}

// Your UI decides how a website opens: here, it asks first.
@Component({
  selector: 'demo-ask-before-opening',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <p class="lead">The document links to <code>https://www.embedpdf.com</code>.</p>
      <button type="button" class="button" (click)="clickLink()">Click the link</button>
      @if (prompt.asking(); as asking) {
        <div class="prompt" role="alertdialog" aria-label="Open a website">
          <p class="prompt-text">
            This document wants to open <strong>{{ asking }}</strong
            >.
          </p>
          <div class="prompt-actions">
            <button type="button" class="button" (click)="prompt.asking.set(null)">
              Stay here
            </button>
            <button type="button" class="button primary" (click)="open(asking)">
              Open in a new tab
            </button>
          </div>
        </div>
      }
    </section>
  `,
})
export class AskBeforeOpening {
  private readonly actions = inject(EpdfActions);
  protected readonly prompt = inject(LinkPrompt);

  constructor() {
    // The link is clicked once on load, so the question is there to see.
    this.clickLink();
  }

  protected clickLink() {
    void this.actions.execute(websiteLink, click);
  }

  protected open(uri: string) {
    window.open(uri, '_blank', 'noopener');
    this.prompt.asking.set(null);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, AskBeforeOpening],
  providers: [
    LinkPrompt,
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withActions(),
      withActionsUi(() => {
        const prompt = inject(LinkPrompt);
        return { openUri: (uri) => prompt.asking.set(uri) };
      }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './website-links.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-ask-before-opening *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
