import {
  ChangeDetectionStrategy,
  Component,
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

const registration = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/registration.pdf');
  return { kind: 'bytes', id: 'registration', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// What each person may do, as permissions: the sender places fields for both signers, and each
// signer fills in and signs their own.
const see = ['doc.open', 'doc.render', 'doc.download', 'doc.forms.read'];
const people = {
  sender: {
    name: 'The sender',
    scope: [
      ...see,
      'doc.forms.modify',
      'fields:set-group:group=attendee',
      'fields:set-group:group=manager',
    ],
  },
  attendee: {
    name: 'Dana Smith',
    scope: [...see, 'fields:fill:group=attendee', 'fields:sign:group=attendee'],
  },
  manager: {
    name: 'Ada Lovelace',
    scope: [...see, 'fields:fill:group=manager', 'fields:sign:group=manager'],
  },
};
type Person = keyof typeof people;

// Who the document's groups are: your app's own list. The PDF holds only each field's group id.
const signers = [
  { id: 'attendee', label: 'Dana Smith', color: '#2563eb' },
  { id: 'manager', label: 'Ada Lovelace' }, // a color is picked for it
];

const FIELD_TOOLS = [
  ['form-text', 'Text'],
  ['form-checkbox', 'Checkbox'],
  ['form-signature', 'Signature'],
] as const;

/** The sender picks who the next field is for, then a tool, and clicks the page. */
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
  protected readonly tools = FIELD_TOOLS;

  constructor() {
    // Start by placing text fields for the first signer.
    this.form.setDesignGroup('attendee');
    this.interaction.activateTool('form-text');
  }
}

/** A signer sees whose field is whose: theirs stand out, and the others take no input. */
@Component({
  selector: 'demo-signer-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      @for (group of form.groups(); track group.id) {
        <span class="legend">
          <i class="swatch" [style.background]="group.color"></i>
          {{ group.label ?? group.id }}: {{ count(group.id) }}
        </span>
      }
      <output class="readout">
        {{ people[person()].name }} fills in the fields in their color
      </output>
    </div>
  `,
})
export class SignerLegend {
  readonly person = input.required<Person>();

  protected readonly form = inject(EpdfForm);
  protected readonly people = people;

  /** How many fields are in a group. */
  protected count(groupId: string) {
    return this.form.fields().filter((field) => field.groupId === groupId).length;
  }
}

/** Names the open document's groups, and shows the sender's toolbar or a signer's legend. */
@Component({
  selector: 'demo-toolbar',
  imports: [SenderToolbar, SignerLegend],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The open document says what its user may do: it is the sender's while they may
         design it. -->
    @if (form.canDesign()) {
      <demo-sender-toolbar />
    } @else {
      <demo-signer-legend [person]="person()" />
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
        engine: () => localEngine(),
        scope: people.sender.scope,
        initialDocuments: [{ source: registration, name: 'registration.pdf' }],
      },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './signers.css',
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

  // A document keeps the permissions it opened with, so the next person opens the saved form again.
  protected async handOver(person: Person) {
    if (person === this.person()) return;
    this.person.set(person);
    this.viewer.updateSettings({ scope: people[person].scope });
    const id = this.document.id();
    if (!id) return;
    const bytes = await this.documents.download();
    await this.documents.close(id);
    await this.documents.open({ kind: 'bytes', bytes }, { name: 'registration.pdf' });
  }
}
