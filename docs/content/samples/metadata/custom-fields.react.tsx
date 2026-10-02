import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, isPluginError } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { metadataPlugin, useMetadata, useMetadataState } from '@embedpdf/react/metadata';
import { localEngine } from '@embedpdf/engine';

import './custom-fields.css';

const engine = localEngine();
const plugins = [metadataPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// Your own fields, kept in the document: add one, change one, remove one.
function CustomFields() {
  const metadata = useMetadata();
  const { custom } = useMetadataState();
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Two fields of our own, written on load. Setting the same values again changes nothing.
  useEffect(() => {
    void metadata.custom.update({ contractId: 'C-2026-114', reviewedBy: 'dana' });
  }, [metadata]);

  const canUpdate = metadata.canUpdate();
  const add = async () => {
    try {
      await metadata.custom.update({ [name.trim()]: value });
      setName('');
      setValue('');
      setError(null);
    } catch (failure) {
      // A name the PDF can't take, such as one of the standard fields.
      if (isPluginError(failure, 'invalid-input')) setError(failure.message);
      else throw failure;
    }
  };

  return (
    <section className="panel">
      <table className="fields">
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
            <th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {Object.entries(custom ?? {}).map(([key, text]) => (
            <tr key={key}>
              <td className="key">{key}</td>
              <td>{text}</td>
              <td>
                <button
                  type="button"
                  className="button quiet"
                  disabled={!canUpdate}
                  // null removes a field; the others stay as they are.
                  onClick={() => metadata.custom.update({ [key]: null })}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="add"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <input
          className="field"
          aria-label="Name"
          placeholder="Name, such as approvedOn"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="field"
          aria-label="Value"
          placeholder="Value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" className="button" disabled={!canUpdate || !name.trim()}>
          Add
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <CustomFields />
      </DocumentGate>
    </Viewer>
  );
}
