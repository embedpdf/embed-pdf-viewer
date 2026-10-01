import { useCallback, useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { annotationPlugin, useAnnotation } from '@embedpdf/react/annotation';
import { LinkLayer, linkPlugin, useLink, useLinkEvent } from '@embedpdf/react/link';
import { cloudEngine } from '@cloudpdf/engine';

import './list.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// The annotation plugin is only here to make the links below.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  linkPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Where the links go on the first page, in page coordinates.
const TO_PAGE_3 = { x: 72, y: 24, width: 160, height: 28 };
const TO_WEBSITE = { x: 250, y: 24, width: 190, height: 28 };
const TO_SCRIPT = { x: 458, y: 24, width: 82, height: 28 };

// Made on load, since the document has none: a label the page shows, and a link over it.
// The third one is a `javascript:` address, which a link never opens.
function AddLinks({ onAdded }: { onAdded: () => void }) {
  const annotation = useAnnotation();
  const pages = usePageList();
  const added = useRef(false);

  useEffect(() => {
    const [first, , third] = pages;
    if (!first || !third || added.current) return;
    added.current = true;
    const label = (text: string, box: typeof TO_PAGE_3) =>
      annotation.create(first.ref, {
        subtype: 'free-text',
        box,
        contents: text,
        fontSize: 13,
        fontColor: '#054fb3',
        interiorColor: '#e8f1ff',
        color: '#7db6ff',
        strokeWidth: 1,
      });
    void (async () => {
      await label('Go to page 3 →', TO_PAGE_3);
      await label('Open embedpdf.com ↗', TO_WEBSITE);
      await label('A script', TO_SCRIPT);
      await annotation.create(first.ref, {
        subtype: 'link',
        rect: TO_PAGE_3,
        target: { kind: 'goto', destination: { kind: 'fit', page: third.ref } },
      });
      await annotation.create(first.ref, {
        subtype: 'link',
        rect: TO_WEBSITE,
        target: { kind: 'uri', uri: 'https://www.embedpdf.com' },
      });
      await annotation.create(first.ref, {
        subtype: 'link',
        rect: TO_SCRIPT,
        target: { kind: 'uri', uri: 'javascript:alert(1)' },
      });
      onAdded();
    })();
  }, [annotation, pages, onAdded]);

  return null;
}

// The first page's links, read from the plugin, each with a button that follows it.
function LinkList({ ready }: { ready: boolean }) {
  const link = useLink();
  const [last, setLast] = useState<string | null>(null);

  // Every way of following a link ends up here: a click, a key, or code.
  useLinkEvent(
    (link) => link.onActivated,
    ({ target, activation }) => setLast(`${target.kind} → ${activation.outcome}`),
  );

  const links = ready ? link.listLinks(0) : [];

  return (
    <aside className="panel">
      <h3 className="heading">Links on page 1</h3>
      <ul className="links">
        {links.map((item) => (
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
  // The list reads the links once they're made.
  const [ready, setReady] = useState(false);
  const onAdded = useCallback(() => setReady(true), []);

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddLinks onAdded={onAdded} />
        <div className="layout">
          <LinkList ready={ready} />
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
