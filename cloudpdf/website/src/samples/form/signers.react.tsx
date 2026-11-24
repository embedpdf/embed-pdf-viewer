import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, useDocument, useDocuments } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { Anchored } from '@embedpdf/react/anchored';
import {
  FormLayer,
  formPlugin,
  useForm,
  useFormState,
  useFormWidgetAnchor,
} from '@embedpdf/react/form';
import { signaturePlugin, useSignature, useSignatureState } from '@embedpdf/react/signature';
import { cloudEngine } from '@cloudpdf/engine';

import './signers.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
  // An empty signature field becomes a button. With no key, a mark is drawn into the field.
  signaturePlugin(),
];

// Who the document's groups are: your app's own list. The PDF holds only each field's group id.
const signers = [
  { id: 'borrower', label: 'Dana Smith', color: '#2563eb' },
  { id: 'approver', label: 'Ada Lovelace' }, // a color is picked for it
];

const loan: OpenInput = { kind: 'grant', grant: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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

const FIELD_TOOLS = [
  ['form-text', 'Text'],
  ['form-checkbox', 'Checkbox'],
  ['form-signature', 'Signature'],
] as const;

// A document keeps the permissions it opened with, so the next person opens the saved form again.
function HandOver({ person }: { person: Person }) {
  const documents = useDocuments();
  const { id } = useDocument();
  const opened = useRef(person);

  useEffect(() => {
    if (person === opened.current || !id) return;
    opened.current = person;
    void (async () => {
      const bytes = await documents.download();
      await documents.close(id);
      await documents.open({ kind: 'bytes', bytes }, { name: 'equipment-loan.pdf' });
    })();
  }, [person, id, documents]);
  return null;
}

/** The sender picks who the next field is for, then a tool, and clicks the page. */
function SenderToolbar() {
  const form = useForm();
  const interaction = useInteraction();
  const { groups, designGroup } = useFormState();
  const { activeToolId } = useInteractionState();

  // Start by placing text fields for the first signer.
  useEffect(() => {
    form.setDesignGroup('borrower');
    interaction.activateTool('form-text');
  }, [form, interaction]);

  return (
    <div className="toolbar">
      <span className="label">Next field is for</span>
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          className="button"
          aria-pressed={designGroup === group.id}
          disabled={!form.canSetGroup(group.id)}
          onClick={() => form.setDesignGroup(group.id)}
        >
          <i className="swatch" style={{ background: group.color }} />
          {group.label ?? group.id}
        </button>
      ))}
      <span className="divider" />
      {FIELD_TOOLS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className="button"
          aria-pressed={activeToolId === id}
          onClick={() => interaction.activateTool(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A signer sees whose field is whose: theirs stand out, and the others take no input. */
function SignerLegend({ person }: { person: Person }) {
  const { groups, fields } = useFormState();
  return (
    <div className="toolbar">
      {groups.map((group) => (
        <span key={group.id} className="legend">
          <i className="swatch" style={{ background: group.color }} />
          {group.label ?? group.id}: {fields.filter((field) => field.groupId === group.id).length}
        </span>
      ))}
      <output className="readout">{people[person].name} fills in the fields in their color</output>
    </div>
  );
}

const INK = '#1d2b53';
type Point = { x: number; y: number };

/**
 * A signer pressed their signature field, with a click or with Tab and Space: the field is the
 * signature plugin's target, and this card opens next to it. What they draw goes into the field.
 */
function SignCard() {
  const form = useForm();
  const signature = useSignature();
  const { target } = useSignatureState();
  const anchor = useFormWidgetAnchor(target ? (form.getWidgets(target)[0]?.ref ?? null) : null);
  const card = useRef<HTMLDivElement>(null);
  const pad = useRef<HTMLCanvasElement>(null);
  const last = useRef<Point | null>(null);
  const [drawn, setDrawn] = useState(false);

  // Each field starts with an empty pad, and the card takes the cursor, so Escape closes it.
  useEffect(() => {
    last.current = null;
    setDrawn(false);
    pad.current?.getContext('2d')?.clearRect(0, 0, pad.current.width, pad.current.height);
    if (target) card.current?.focus();
  }, [target]);

  if (!target) return null;

  const pointOf = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    last.current = pointOf(event);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const from = last.current;
    const ink = event.currentTarget.getContext('2d');
    if (!from || !ink || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const to = pointOf(event);
    last.current = to;
    ink.strokeStyle = INK;
    ink.lineWidth = 2;
    ink.lineCap = 'round';
    ink.beginPath();
    ink.moveTo(from.x, from.y);
    ink.lineTo(to.x, to.y);
    ink.stroke();
    setDrawn(true);
  };

  // Close without signing, and put the cursor back on the field.
  const close = () => {
    signature.setTarget(null);
    form.focus(target);
  };

  // The drawing goes into the field as a picture.
  const sign = () =>
    pad.current?.toBlob(async (png) => {
      if (!png) return;
      await signature.placeMark({ source: png }, { field: target });
      form.focus(target);
    });

  return (
    <Anchored anchor={anchor} placement="bottom-start" gap={8}>
      <div
        ref={card}
        className="sign-card"
        role="dialog"
        aria-label="Draw your signature"
        tabIndex={-1}
        onKeyDown={(event) => event.key === 'Escape' && close()}
      >
        {/* Anchored UI keeps a press from reaching the page under it, before React hears it:
            the pad listens while the press is on its way down. */}
        <canvas
          ref={pad}
          className="sign-pad"
          width={240}
          height={100}
          onPointerDownCapture={start}
          onPointerMove={draw}
        />
        <div className="sign-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button type="button" className="button" disabled={!drawn} onClick={sign}>
            Sign
          </button>
        </div>
      </div>
    </Anchored>
  );
}

function Toolbar({ person }: { person: Person }) {
  const form = useForm();

  // Tell the open document who its groups are, before the first paint.
  useLayoutEffect(() => {
    form.setGroups(signers);
  }, [form]);

  // The open document says what its user may do: it is the sender's while they may design it.
  return form.canDesign() ? <SenderToolbar /> : <SignerLegend person={person} />;
}

export default function App() {
  const [person, setPerson] = useState<Person>('sender');
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      scope={people[person].scope}
      initialDocuments={[{ source: loan, name: 'equipment-loan.pdf' }]}
    >
      <div className="toolbar">
        <span className="label">Open the form as</span>
        <div className="segments">
          {(Object.keys(people) as Person[]).map((each) => (
            <button
              key={each}
              type="button"
              className="segment"
              aria-pressed={person === each}
              onClick={() => setPerson(each)}
            >
              {people[each].name}
            </button>
          ))}
        </div>
      </div>
      <HandOver person={person} />
      <DocumentGate fallback={<p className="loading">Opening…</p>}>
        <Toolbar person={person} />
        <Stage className="stage" overlay={<SignCard />}>
          {() => (
            <>
              <RenderLayer />
              <AnnotationLayer />
              <FormLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
