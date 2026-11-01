import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { actionsPlugin, useActionsUiAdapter } from '@embedpdf/react/actions';
import { LinkLayer, linkPlugin, useLink, useLinkEvent } from '@embedpdf/react/link';
import type { Link } from '@embedpdf/react/link';
import { localEngine } from '@embedpdf/engine';

import './list.css';

const engine = localEngine();
// The actions plugin runs a link that names a viewer command, such as the footer's Next.
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), actionsPlugin(), linkPlugin()];

// [!doc-source links]
const links = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/links.pdf');
  return { kind: 'bytes', id: 'links', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The browser's way to open a website, once for the viewer.
function BrowserActions() {
  useActionsUiAdapter();
  return null;
}

// The first page's links, read from the plugin, each with a button that follows it.
function LinkList() {
  const link = useLink();
  const [items, setItems] = useState<readonly Link[]>([]);
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    void link.ensureLoaded(0).then(() => setItems(link.listLinks(0)));
  }, [link]);

  // Every way of following a link ends up here: a click, a key, or code.
  useLinkEvent(
    (link) => link.onActivated,
    ({ target, activation }) => setLast(`${target.kind} → ${activation.outcome}`),
  );

  return (
    <aside className="panel">
      <h3 className="heading">Links on page 1</h3>
      <ul className="links">
        {items.map((item) => (
          <li key={item.id} className="link">
            <span className="kind">{item.target.kind}</span>
            <span className="label">{link.getLabel(item)}</span>
            <span className="where">
              at {Math.round(item.bounds.x)}, {Math.round(item.bounds.y)}
            </span>
            <button type="button" className="button" onClick={() => link.activate(item)}>
              Follow
            </button>
          </li>
        ))}
      </ul>
      <p className="last">
        <code>onActivated</code> {last ?? 'not yet'}
      </p>
    </aside>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: links }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <BrowserActions />
        <div className="layout">
          <LinkList />
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <LinkLayer />
              </>
            )}
          </Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}
