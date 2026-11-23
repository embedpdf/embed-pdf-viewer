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
import { FormLayer, formPlugin, useForm, useFormState } from '@embedpdf/react/form';
import { cloudEngine } from '@cloudpdf/engine';

import './signers.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
];

// Who the document's groups are: your app's own list. The PDF holds only each field's group id.
const signers = [
  { id: 'attendee', label: 'Dana Smith', color: '#2563eb' },
  { id: 'manager', label: 'Ada Lovelace' }, // a color is picked for it
];

const registration: OpenInput = { kind: 'grant', grant: 'shr_sjOrUrwF2Sf0X5ADfySRG58L' };

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
      await documents.open({ kind: 'bytes', bytes }, { name: 'registration.pdf' });
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
    form.setDesignGroup('attendee');
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
      initialDocuments={[{ source: registration, name: 'registration.pdf' }]}
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
        <Stage className="stage">
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
