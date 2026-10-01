import { useEffect, useRef, useState } from 'react';
import {
  Viewer,
  DocumentGate,
  saveFile,
  useDocument,
  useDocuments,
  usePageList,
} from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  SelectionLayer,
  copySelection,
  selectionPlugin,
  useSelection,
  useSelectionState,
} from '@embedpdf/react/selection';
import { SearchLayer, searchPlugin, useSearch } from '@embedpdf/react/search';
import { localEngine } from '@embedpdf/engine';

import './checks.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  searchPlugin(),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// What each role may do, as permissions.
const roles = {
  viewer: ['doc.open', 'doc.render', 'doc.text.select'],
  reviewer: ['doc.open', 'doc.render', 'doc.text.select', 'doc.text.copy', 'doc.text.search'],
  owner: [
    'doc.open',
    'doc.render',
    'doc.text.select',
    'doc.text.copy',
    'doc.text.search',
    'doc.download',
  ],
};
type Role = keyof typeof roles;

// A document keeps the permissions it opened with, so a new role opens it again.
function ReopenOnRoleChange({ role }: { role: Role }) {
  const documents = useDocuments();
  const { id } = useDocument();
  const opened = useRef(role);
  useEffect(() => {
    if (role === opened.current || !id) return;
    opened.current = role;
    void documents.close(id).then(() => documents.open(ebook, { name: 'ebook.pdf' }));
  }, [role, id, documents]);
  return null;
}

// Each control shows only when its check says yes.
function Controls() {
  const documents = useDocuments();
  const search = useSearch();
  const selection = useSelection();
  const hasSelection = useSelectionState((state) => state.hasSelection);
  const cover = usePageList()[0]?.ref;
  const [text, setText] = useState('PDF');
  const [copied, setCopied] = useState('');

  // On load: a search, and some text selected, so every check has something to act on.
  useEffect(() => {
    if (search.canSearch()) void search.search({ text });
  }, [search, text]);
  useEffect(() => {
    if (cover) selection.select({ page: cover, start: 10, count: 52 });
  }, [selection, cover]);

  const copy = async () => {
    await copySelection(selection).catch(() => {}); // the browser may refuse the clipboard
    setCopied(await selection.readText());
  };

  return (
    <>
      <div className="toolbar">
        {search.canSearch() && (
          <input
            className="field"
            type="search"
            aria-label="Search"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
        {selection.canCopy() && (
          <button type="button" className="button" disabled={!hasSelection} onClick={copy}>
            Copy
          </button>
        )}
        {documents.canDownload() && (
          <button
            type="button"
            className="button"
            onClick={async () => saveFile(await documents.download(), 'ebook.pdf')}
          >
            Download
          </button>
        )}
      </div>
      <p className="note">{copied ? `Copied: “${copied}”` : ' '}</p>
    </>
  );
}

export default function App() {
  const [role, setRole] = useState<Role>('reviewer');
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      scope={roles[role]}
      initialDocuments={[{ source: ebook, name: 'ebook.pdf' }]}
    >
      <div className="toolbar">
        <label className="label">
          Role
          <select
            className="select"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            <option value="viewer">viewer: read and select</option>
            <option value="reviewer">reviewer: also search and copy</option>
            <option value="owner">owner: also download</option>
          </select>
        </label>
      </div>
      <ReopenOnRoleChange role={role} />
      <DocumentGate fallback={<p className="loading">Opening…</p>}>
        <Controls />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SearchLayer />
              <SelectionLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
