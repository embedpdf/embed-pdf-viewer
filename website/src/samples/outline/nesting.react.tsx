import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { outlinePlugin, useOutline, useOutlineState } from '@embedpdf/react/outline';
import type { OutlineItem, OutlineItemRef } from '@embedpdf/react/outline';
import { localEngine } from '@embedpdf/engine';

import './nesting.css';

const engine = localEngine();
const plugins = [outlinePlugin()];

const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const same = (left: OutlineItemRef | null, right: OutlineItemRef | null) =>
  left?.objectNumber === right?.objectNumber;

/** The picked item, the one before it among its parent's children, and its parent. */
const neighboursOf = (items: readonly OutlineItem[], picked: OutlineItemRef | undefined) => {
  const item = items.find((each) => same(each.ref, picked ?? null)) ?? null;
  if (!item) return { item, previous: null, parent: null };
  const siblings = items.filter((each) => same(each.parent, item.parent));
  const previous = siblings[siblings.indexOf(item) - 1] ?? null;
  const parent = items.find((each) => same(each.ref, item.parent)) ?? null;
  return { item, previous, parent };
};

// An outline being built: add items, nest them, fold them, rename and delete them.
function OutlineEditor() {
  const outline = useOutline();
  const { items, rows, selected, canEdit } = useOutlineState();
  const [title, setTitle] = useState('Chapter');
  const [picked] = selected;
  const { item, previous, parent } = neighboursOf(items, picked);

  // After the picked item, or at the end.
  const add = (inside: boolean) =>
    outline.create(
      inside && item
        ? { title, parent: item.ref }
        : { title, parent: item?.parent ?? null, position: item ? { after: item.ref } : 'end' },
      { select: true },
    );

  const indent = () => {
    if (!item || !previous) return;
    outline.move([item.ref], previous.ref, 'end');
    outline.expand(previous.ref);
  };

  const outdent = () => {
    if (item && parent) outline.move([item.ref], parent.parent, { after: parent.ref });
  };

  return (
    <div className="editor">
      <div className="toolbar">
        <input
          className="field"
          value={title}
          aria-label="Title"
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="button" className="button" disabled={!canEdit} onClick={() => add(false)}>
          Add
        </button>
        <button
          type="button"
          className="button"
          disabled={!canEdit || !item}
          onClick={() => add(true)}
        >
          Add inside
        </button>
        <button type="button" className="button" disabled={!canEdit || !previous} onClick={indent}>
          Indent
        </button>
        <button type="button" className="button" disabled={!canEdit || !parent} onClick={outdent}>
          Outdent
        </button>
        <button
          type="button"
          className="button"
          disabled={!canEdit || !item}
          onClick={() => item && outline.update(item.ref, { title })}
        >
          Rename
        </button>
        <button
          type="button"
          className="button"
          disabled={!canEdit || !item}
          onClick={() => item && outline.delete([item.ref])}
        >
          Delete
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="empty">This document has no outline yet. Add an item.</p>
      ) : (
        <ul className="tree" role="tree">
          {rows.map(({ item: row, depth, hasChildren, expanded }) => (
            <li
              key={row.ref.objectNumber}
              className="row"
              role="treeitem"
              aria-level={depth + 1}
              aria-expanded={hasChildren ? expanded : undefined}
              aria-selected={row.ref.objectNumber === picked?.objectNumber}
              style={{ paddingInlineStart: 6 + depth * 18 }}
            >
              <button
                type="button"
                className="chevron"
                aria-label={expanded ? 'Collapse' : 'Expand'}
                disabled={!hasChildren}
                data-expanded={expanded || undefined}
                onClick={() => outline.toggle(row.ref)}
              ></button>
              <button
                type="button"
                className="row-title"
                onClick={() => {
                  outline.select([row.ref]);
                  setTitle(row.title);
                }}
              >
                {row.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: welcome }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <OutlineEditor />
      </DocumentGate>
    </Viewer>
  );
}
