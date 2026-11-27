import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocument,
  EpdfDocumentGate,
  EpdfDocuments,
  EpdfViewer,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();

// [!doc-source loan]
const loan = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/loan.pdf');
  return { kind: 'bytes', id: 'loan', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// Who the document's groups are: your app's own list. The PDF holds only each field's group id.
const signers = [
  { id: 'borrower', label: 'Dana Smith', color: '#2563eb' },
  { id: 'approver', label: 'Ada Lovelace' }, // a color is picked for it
];

// The sender places fields for both signers. Each signer fills in and signs their own, and your
// app knows who each of them is.
const see = ['doc.open', 'doc.render', 'doc.download', 'doc.forms.read'];
const people = {
  sender: {
    name: 'The sender',
    scope: [
      ...see,
      'doc.forms.modify',
      'fields:set-group:group=borrower',
      'fields:set-group:group=approver',
    ],
    identity: null,
  },
  borrower: {
    name: 'Dana Smith',
    scope: [...see, 'fields:fill:group=borrower', 'fields:sign:group=borrower'],
    identity: {
      userId: 'u_381',
      displayName: 'Dana Smith',
      email: 'dana@fernquill.example',
      organization: 'Fernquill Ltd',
      title: 'Operations',
    },
  },
  approver: {
    name: 'Ada Lovelace',
    scope: [...see, 'fields:fill:group=approver', 'fields:sign:group=approver'],
    identity: {
      userId: 'u_412',
      displayName: 'Ada Lovelace',
      email: 'ada@fernquill.example',
      organization: 'Fernquill Ltd',
      title: 'Finance',
    },
  },
};
type Person = keyof typeof people;

// A tool for each kind of value: a text box that says what it is for.
const VALUE_TOOLS = [
  ['form-name', 'Name'],
  ['form-email', 'Email'],
  ['form-organization', 'Organization'],
  ['form-organization-title', 'Title'],
  ['form-date-signed', 'Date signed'],
] as const;

/** The sender picks who the next field is for and what it is for, and clicks the page. */
@Component({
  selector: 'demo-sender-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <span class="label">Next field is for</span>
      @for (group of form.groups(); track group.id) {
        <button
          type="button"
          class="button"
          [attr.aria-pressed]="form.designGroup() === group.id"
          [disabled]="!form.canSetGroup(group.id)"
          (click)="form.setDesignGroup(group.id)"
        >
          <i class="swatch" [style.background]="group.color"></i>{{ group.label ?? group.id }}
        </button>
      }
      <span class="divider"></span>
      @for (tool of tools; track tool[0]) {
        <button
          type="button"
          class="button"
          [attr.aria-pressed]="interaction.activeToolId() === tool[0]"
          (click)="interaction.activateTool(tool[0])"
        >
          {{ tool[1] }}
        </button>
      }
    </div>
  `,
})
export class SenderToolbar {
  protected readonly form = inject(EpdfForm);
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly tools = VALUE_TOOLS;

  constructor() {
    // Start by placing name fields for the first signer.
    this.form.setDesignGroup('borrower');
    this.interaction.activateTool('form-name');
  }
}

/** A signer starts: the app fills in what it knows about them, in their own fields, as one change. */
@Component({
  selector: 'demo-signer-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <output class="readout">{{ message() }}</output>
    </div>
  `,
})
export class SignerBar {
  readonly person = input.required<Person>();

  private readonly filled = signal<number | null>(null);
  protected readonly message = computed(() => {
    const filled = this.filled();
    return filled === null
      ? 'Filling in what the app knows…'
      : `Filled in for ${people[this.person()].name}: ${filled} ${filled === 1 ? 'field' : 'fields'}`;
  });

  constructor() {
    // Another signer's field is left for them, and so is a field that has a value.
    void inject(EpdfForm)
      .prefill()
      .then(({ applied }) => this.filled.set(applied.length));
  }
}

/** Names the open document's groups, and shows the sender's toolbar or a signer's bar. */
@Component({
  selector: 'demo-toolbar',
  imports: [SenderToolbar, SignerBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The open document says what its user may do: it is the sender's while they may
         design it. -->
    @if (form.canDesign()) {
      <demo-sender-toolbar />
    } @else {
      <demo-signer-bar [person]="person()" />
    }
  `,
})
export class Toolbar {
  readonly person = input.required<Person>();

  protected readonly form = inject(EpdfForm);

  constructor() {
    // Tell the open document who its groups are.
    this.form.setGroups(signers);
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    EpdfFormLayer,
    Toolbar,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine,
        scope: people.sender.scope,
        identity: people.sender.identity,
        initialDocuments: [{ source: loan, name: 'equipment-loan.pdf' }],
      },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './purposes.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="toolbar">
      <span class="label">Open the form as</span>
      <div class="segments">
        @for (each of everyone; track each) {
          <button
            type="button"
            class="segment"
            [attr.aria-pressed]="person() === each"
            (click)="handOver(each)"
          >
            {{ people[each].name }}
          </button>
        }
      </div>
    </div>
    <ng-container *epdfDocumentGate="let document; fallback: opening">
      <demo-toolbar [person]="person()" />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer />
          <epdf-form-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #opening><p class="loading">Opening…</p></ng-template>
  `,
})
export class App {
  private readonly viewer = inject(EpdfViewer);
  private readonly documents = inject(EpdfDocuments);
  private readonly document = inject(EpdfDocument);
  protected readonly people = people;
  protected readonly everyone = Object.keys(people) as Person[];
  protected readonly person = signal<Person>('sender');

  // A document keeps who it opened for, so the next person opens the saved form again.
  protected async handOver(person: Person) {
    if (person === this.person()) return;
    this.person.set(person);
    const { scope, identity } = people[person];
    this.viewer.updateSettings({ scope, identity });
    const id = this.document.id();
    if (!id) return;
    const bytes = await this.documents.download();
    await this.documents.close(id);
    await this.documents.open({ kind: 'bytes', bytes }, { name: 'equipment-loan.pdf' });
  }
}
