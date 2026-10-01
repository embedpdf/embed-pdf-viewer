import type { DocumentsCapability } from '@embedpdf/core';
import { DocumentsToken } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import { describe, expect, it } from 'vitest';

import { createViewManagerController } from '../src/controller';
import { initialViewManagerState } from '../src/model';
import { viewManagerState } from '../src/state';

function harness(open: string[] = []) {
  const documents = { getOrder: () => open } as unknown as DocumentsCapability;
  const ctx = createTestContext({
    id: 'view-manager',
    state: initialViewManagerState(),
    capabilities: [[DocumentsToken, documents]],
    doc: null,
  });
  return { ...createViewManagerController(ctx), open, notify: ctx.notify };
}

describe('view-manager', () => {
  it('reconciles open documents into a default pane and reports pane events', () => {
    const open = ['a', 'b'];
    const { api, connect } = harness(open);
    const log: string[] = [];
    api.onPaneCreated((event) => log.push(`+pane:${event.paneId}`));
    api.onFocusChanged((event) => log.push(`focus:${event.paneId}`));
    api.onDocumentMoved((event) =>
      log.push(`doc:${event.documentId}:${event.fromPaneId}->${event.toPaneId}`),
    );
    connect();
    expect(api.listPanes().map((pane) => pane.id)).toEqual(['pane-1']);
    expect(api.getPane('pane-1')?.documentIds).toEqual(['a', 'b']);
    expect(api.getPaneOfDocument('b')).toBe('pane-1');
    expect(api.getFocusedPaneId()).toBe('pane-1');
    const panes = api.listPanes();
    expect(api.listPanes()).toBe(panes); // reference-stable
    expect(log).toEqual([
      '+pane:pane-1',
      'focus:pane-1',
      'doc:a:null->pane-1',
      'doc:b:null->pane-1',
    ]);
  });

  it('splits, moves documents between panes, and folds a removed pane back', () => {
    const { api, connect } = harness(['a', 'b']);
    connect();
    const log: string[] = [];
    api.onDocumentMoved((event) =>
      log.push(`${event.documentId}:${event.fromPaneId}->${event.toPaneId}`),
    );
    api.onPaneRemoved((event) => log.push(`-pane:${event.paneId}`));
    const split = api.splitPane('b');
    expect(split).toBe('pane-2');
    expect(api.getPane('pane-1')?.documentIds).toEqual(['a']);
    expect(api.getPane('pane-2')?.documentIds).toEqual(['b']);
    expect(api.getFocusedPaneId()).toBe('pane-2');
    // one pane per document: adding to another pane moves it
    api.addDocument('pane-1', 'b');
    expect(api.getPane('pane-2')?.documentIds).toEqual([]);
    api.moveDocumentBetween('pane-1', 'pane-2', 'a', 0);
    api.movePane('pane-2', 0);
    expect(api.getPaneOrder()).toEqual(['pane-2', 'pane-1']);
    api.removePane('pane-2');
    expect(api.listPanes().map((pane) => pane.id)).toEqual(['pane-1']);
    expect(api.getPane('pane-1')?.documentIds).toEqual(['b', 'a']);
    expect(log).toEqual([
      'b:pane-1->pane-2',
      'b:pane-2->pane-1',
      'a:pane-1->pane-2',
      'a:pane-2->pane-1',
      '-pane:pane-2',
    ]);
  });
});

describe('splitting', () => {
  it('puts the new pane beside the focused pane, or beside `from`', () => {
    const { api, connect } = harness(['a', 'b', 'c', 'd']);
    connect();
    api.createPane(); // pane-2, at the end, focused
    api.setFocusedPane('pane-1');
    expect(api.splitPane('b')).toBe('pane-3');
    expect(api.getPaneOrder()).toEqual(['pane-1', 'pane-3', 'pane-2']);
    expect(api.getFocusedPaneId()).toBe('pane-3');

    expect(api.splitPane('c', { from: 'pane-2' })).toBe('pane-4');
    expect(api.getPaneOrder()).toEqual(['pane-1', 'pane-3', 'pane-2', 'pane-4']);
    expect(api.getPane('pane-4')?.documentIds).toEqual(['c']);
    expect(api.getPaneOfDocument('c')).toBe('pane-4');

    api.setFocusedPane(null);
    expect(api.splitPane('d')).toBe('pane-5'); // no pane to go beside: the end
    expect(api.getPaneOrder().at(-1)).toBe('pane-5');
  });
});

describe('the State table', () => {
  it('reads the panes and the focused pane, and is empty with no capability', () => {
    const { api, connect } = harness(['a']);
    connect();
    expect(viewManagerState.read(api)).toEqual({
      panes: api.listPanes(),
      focusedPaneId: 'pane-1',
    });
    expect(viewManagerState.read(api).panes).toBe(api.listPanes());
    expect(viewManagerState.empty).toEqual({ panes: [], focusedPaneId: null });
  });
});

describe('a document that gets its real id while opening', () => {
  it('keeps its pane and its place in the tabs', () => {
    let order = ['a', 'pending:1'];
    const documents = { getOrder: () => order } as unknown as DocumentsCapability;
    const ctx = createTestContext({
      id: 'view-manager',
      state: initialViewManagerState(),
      capabilities: [[DocumentsToken, documents]],
      doc: null,
    });
    const api = ctx.connect(createViewManagerController(ctx));
    api.splitPane('pending:1');
    order = ['a', 'real-id']; // the kernel gives it its real id, in the same place
    ctx.notify();
    expect(api.getPane('pane-1')?.documentIds).toEqual(['a']);
    expect(api.getPane('pane-2')?.documentIds).toEqual(['real-id']);
    expect(api.getPane('pane-2')?.activeDocumentId).toBe('real-id');
  });
});
