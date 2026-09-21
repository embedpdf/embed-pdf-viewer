import type { DocumentsCapability } from '@embedpdf/core';
import { DocumentsToken } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import { describe, expect, it } from 'vitest';

import { createViewManagerController } from '../src/controller';
import { initialViewManagerState, viewManagerReducer } from '../src/model';

function harness(open: string[] = []) {
  const documents = { getOrder: () => open } as unknown as DocumentsCapability;
  const ctx = createTestContext({
    id: 'view-manager',
    initialState: initialViewManagerState(),
    reduce: viewManagerReducer,
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
    api.onPaneCreated((e) => log.push(`+pane:${e.paneId}`));
    api.onFocusChanged((e) => log.push(`focus:${e.paneId}`));
    api.onDocumentMoved((e) => log.push(`doc:${e.documentId}:${e.fromPaneId}->${e.toPaneId}`));
    connect();
    expect(api.listPanes().map((p) => p.id)).toEqual(['pane-1']);
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
    api.onDocumentMoved((e) => log.push(`${e.documentId}:${e.fromPaneId}->${e.toPaneId}`));
    api.onPaneRemoved((e) => log.push(`-pane:${e.paneId}`));
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
    expect(api.listPanes().map((p) => p.id)).toEqual(['pane-1']);
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
