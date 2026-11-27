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

import './purposes.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
];

const loan: OpenInput = { kind: 'grant', grant: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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

// A document keeps who it opened for, so the next person opens the saved form again.
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

/** The sender picks who the next field is for and what it is for, and clicks the page. */
function SenderToolbar() {
  const form = useForm();
  const interaction = useInteraction();
  const { groups, designGroup } = useFormState();
  const { activeToolId } = useInteractionState();

  // Start by placing name fields for the first signer.
  useEffect(() => {
    form.setDesignGroup('borrower');
    interaction.activateTool('form-name');
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
      {VALUE_TOOLS.map(([id, label]) => (
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

/** A signer starts: the app fills in what it knows about them, in their own fields, as one change. */
function SignerBar({ person }: { person: Person }) {
  const form = useForm();
  const [filled, setFilled] = useState<number | null>(null);

  useEffect(() => {
    // Another signer's field is left for them, and so is a field that has a value.
    void form.prefill().then(({ applied }) => setFilled(applied.length));
  }, [form]);

  return (
    <div className="toolbar">
      <output className="readout">
        {filled === null
          ? 'Filling in what the app knows…'
          : `Filled in for ${people[person].name}: ${filled} ${filled === 1 ? 'field' : 'fields'}`}
      </output>
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
  return form.canDesign() ? <SenderToolbar /> : <SignerBar person={person} />;
}

export default function App() {
  const [person, setPerson] = useState<Person>('sender');

  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      scope={people[person].scope}
      identity={people[person].identity}
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
