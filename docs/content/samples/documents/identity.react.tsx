import { useState } from 'react';
import { Viewer, DocumentGate, useDocument, useDocuments } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './identity.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const dana = { userId: 'u_381', displayName: 'Dana Smith' };

// What each role may do, as permissions.
const roles = {
  reader: ['doc.open', 'doc.render', 'doc.text.select'],
  editor: [
    'doc.open',
    'doc.render',
    'doc.text.select',
    'doc.text.copy',
    'doc.download',
    'doc.print',
  ],
};
type Role = keyof typeof roles;

function Toolbar({ role, onRoleChange }: { role: Role; onRoleChange: (role: Role) => void }) {
  const documents = useDocuments();
  // Read the document too, so the checks are read again when it opens or closes.
  const { id } = useDocument();
  // The role the open document was opened with: it keeps that one.
  const [openedAs, setOpenedAs] = useState(role);

  const openAgain = async () => {
    await documents.close(id);
    await documents.open(ebook, { name: 'ebook.pdf' });
    setOpenedAs(role);
  };

  return (
    <>
      <div className="toolbar">
        <label className="label">
          Dana Smith, as
          <select
            className="select"
            value={role}
            onChange={(event) => onRoleChange(event.target.value as Role)}
          >
            <option value="reader">reader</option>
            <option value="editor">editor</option>
          </select>
        </label>
        <span className="check" data-allowed={documents.canDownload()}>
          Download
        </span>
        <span className="check" data-allowed={documents.canPrint()}>
          Print
        </span>
      </div>
      <p className="note">
        This document opened for a {openedAs}.
        {openedAs !== role && (
          <button type="button" className="button" onClick={openAgain}>
            Open it again as {role}
          </button>
        )}
      </p>
    </>
  );
}

export default function App() {
  const [role, setRole] = useState<Role>('reader');
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      identity={dana}
      scope={roles[role]}
      initialDocuments={[{ source: ebook, name: 'ebook.pdf' }]}
    >
      <Toolbar role={role} onRoleChange={setRole} />
      <DocumentGate fallback={<p className="loading">Opening…</p>}>
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
