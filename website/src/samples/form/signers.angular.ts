import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  inject,
  input,
  signal,
  viewChild,
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
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import { EpdfSignature, withSignature } from '@embedpdf/angular/signature';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();

const loan = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/loan.pdf');
  return { kind: 'bytes', id: 'loan', bytes: new Uint8Array(await response.arrayBuffer()) };
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
      'fields:set-group:group=borrower',
      'fields:set-group:group=approver',
    ],
  },
  borrower: {
    name: 'Dana Smith',
    scope: [...see, 'fields:fill:group=borrower', 'fields:sign:group=borrower'],
  },
  approver: {
    name: 'Ada Lovelace',
    scope: [...see, 'fields:fill:group=approver', 'fields:sign:group=approver'],
  },
};
type Person = keyof typeof people;

// Who the document's groups are: your app's own list. The PDF holds only each field's group id.
const signers = [
  { id: 'borrower', label: 'Dana Smith', color: '#2563eb' },
  { id: 'approver', label: 'Ada Lovelace' }, // a color is picked for it
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
    this.form.setDesignGroup('borrower');
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

const INK = '#1d2b53';
type Point = { x: number; y: number };

/**
 * A signer pressed their signature field, with a click or with Tab and Space: the field is the
 * signature plugin's target, and this card opens next to it. What they draw goes into the field.
 */
@Component({
  selector: 'demo-sign-card',
  imports: [EpdfAnchored],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (signature.target()) {
      <epdf-anchored [anchor]="anchor()" placement="bottom-start" [gap]="8">
        <div
          #card
          class="sign-card"
          role="dialog"
          aria-label="Draw your signature"
          tabindex="-1"
          (keydown.escape)="close()"
        >
          <canvas
            #pad
            class="sign-pad"
            width="240"
            height="100"
            (pointerdown)="start($event)"
            (pointermove)="draw($event)"
          ></canvas>
          <div class="sign-actions">
            <button type="button" class="button" (click)="close()">Cancel</button>
            <button type="button" class="button" [disabled]="!drawn()" (click)="sign()">
              Sign
            </button>
          </div>
        </div>
      </epdf-anchored>
    }
  `,
})
export class SignCard {
  private readonly form = inject(EpdfForm);
  protected readonly signature = inject(EpdfSignature);
  protected readonly anchor = this.form.widgetAnchorOf(() => {
    const target = this.signature.target();
    return target ? (this.form.getWidgets(target)[0]?.ref ?? null) : null;
  });
  protected readonly drawn = signal(false);

  private readonly card = viewChild<ElementRef<HTMLDivElement>>('card');
  private readonly pad = viewChild<ElementRef<HTMLCanvasElement>>('pad');
  private last: Point | null = null;

  constructor() {
    // Each field starts with an empty pad, and the card takes the cursor, so Escape closes it.
    effect(() => {
      const target = this.signature.target();
      const pad = this.pad()?.nativeElement;
      this.last = null;
      this.drawn.set(false);
      pad?.getContext('2d')?.clearRect(0, 0, pad.width, pad.height);
      if (target) this.card()?.nativeElement.focus();
    });
  }

  private pointOf(event: PointerEvent, canvas: HTMLCanvasElement): Point {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  protected start(event: PointerEvent) {
    const canvas = event.currentTarget as HTMLCanvasElement;
    canvas.setPointerCapture(event.pointerId);
    this.last = this.pointOf(event, canvas);
  }

  protected draw(event: PointerEvent) {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const from = this.last;
    const ink = canvas.getContext('2d');
    if (!from || !ink || !canvas.hasPointerCapture(event.pointerId)) return;
    const to = this.pointOf(event, canvas);
    this.last = to;
    ink.strokeStyle = INK;
    ink.lineWidth = 2;
    ink.lineCap = 'round';
    ink.beginPath();
    ink.moveTo(from.x, from.y);
    ink.lineTo(to.x, to.y);
    ink.stroke();
    this.drawn.set(true);
  }

  // Close without signing, and put the cursor back on the field.
  protected close() {
    const field = this.signature.target();
    this.signature.setTarget(null);
    if (field) this.form.focus(field);
  }

  // The drawing goes into the field as a picture.
  protected sign() {
    const field = this.signature.target();
    this.pad()?.nativeElement.toBlob(async (png) => {
      if (!field || !png) return;
      await this.signature.placeMark({ source: png }, { field });
      this.form.focus(field);
    });
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
    SignCard,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine,
        scope: people.sender.scope,
        initialDocuments: [{ source: loan, name: 'equipment-loan.pdf' }],
      },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withForm(),
      // An empty signature field becomes a button. With no key, a mark is drawn into the field.
      withSignature(),
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
        <demo-sign-card />
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
    await this.documents.open({ kind: 'bytes', bytes }, { name: 'equipment-loan.pdf' });
  }
}
