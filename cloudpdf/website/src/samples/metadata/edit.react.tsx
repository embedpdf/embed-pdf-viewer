import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { DocumentMetadata, OpenInput } from '@embedpdf/react/runtime';
import {
  metadataPlugin,
  useMetadata,
  useMetadataEvent,
  useMetadataState,
} from '@embedpdf/react/metadata';
import { cloudEngine } from '@cloudpdf/engine';

import './edit.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [metadataPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const EDITABLE = ['title', 'author', 'subject', 'keywords'] as const;
type Draft = Record<(typeof EDITABLE)[number], string>;

// A properties form: the inputs start with what the file says, and Save writes them back.
function PropertiesForm({ initial }: { initial: DocumentMetadata }) {
  const metadata = useMetadata();
  const modifiedAt = useMetadataState((state) => state.metadata?.modifiedAt ?? null);
  const [draft, setDraft] = useState<Draft>({
    title: initial.title ?? '',
    author: initial.author ?? '',
    subject: initial.subject ?? '',
    keywords: initial.keywords ?? '',
  });
  const [changes, setChanges] = useState<string[]>([]);

  // Every change to the standard fields, by you or anyone else.
  useMetadataEvent(
    (capability) => capability.onUpdated,
    ({ changedKeys, origin }) =>
      setChanges((list) => [
        `${changedKeys.join(', ')} changed ${origin.kind === 'local' ? 'here' : 'elsewhere'}`,
        ...list,
      ]),
  );

  const canUpdate = metadata.canUpdate();
  // An empty field removes it: null, not ''.
  const save = () =>
    metadata.update({
      title: draft.title.trim() || null,
      author: draft.author.trim() || null,
      subject: draft.subject.trim() || null,
      keywords: draft.keywords.trim() || null,
    });

  return (
    <div className="layout">
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {EDITABLE.map((key) => (
          <label className="row" key={key}>
            <span className="name">{key}</span>
            <input
              className="field"
              value={draft[key]}
              disabled={!canUpdate}
              placeholder="not set"
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          </label>
        ))}
        <div className="actions">
          <button type="submit" className="button primary" disabled={!canUpdate}>
            Save
          </button>
          <button
            type="button"
            className="button"
            disabled={!canUpdate}
            onClick={() => metadata.update({ modifiedAt: new Date() })}
          >
            Set the modified date to now
          </button>
        </div>
      </form>
      <section className="changes" aria-live="polite">
        <h3 className="changes-title">Changes</h3>
        <p className="modified">
          Last changed: {modifiedAt ? new Date(modifiedAt).toLocaleString() : 'not set'}
        </p>
        {changes.length === 0 ? (
          <p className="empty">Edit a field and save.</p>
        ) : (
          <ul className="log">
            {changes.map((change, index) => (
              <li key={changes.length - index}>{change}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// The form starts once the properties have been read from the file.
function PropertiesEditor() {
  const fields = useMetadataState((state) => state.metadata);
  return fields ? <PropertiesForm initial={fields} /> : <p className="loading">Reading…</p>;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <PropertiesEditor />
      </DocumentGate>
    </Viewer>
  );
}
