import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import { actionsPlugin, ActionsToken } from '@embedpdf/plugin-actions';
import type { ActionDiagnostic } from '@embedpdf/plugin-actions';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'engine',
  'main',
  'test',
  'fixtures',
  'action_doc_events.pdf',
);

/**
 * Document lifecycle actions on a real engine and a real script VM: the catalog
 * /AA trees (ISO 32000-2 Table 200) fire through the verb-owner doors,
 * every script effect is a document mutation, and the saved-byte boundary
 * is exact — the WillSave write is in the bytes a save pulls, the DidSave
 * write is not (it lives in the document and rides the next save).
 */
async function boot(options: { scope?: string[]; openSequence?: 'auto' | 'off' } = {}) {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const kernel = createKernel({
    engine,
    plugins: [
      interactionPlugin(),
      actionsPlugin({
        ...(options.openSequence ? { openSequence: options.openSequence } : {}),
        javascript: {
          enabled: true,
          sandboxFactory: createQuickJsSandbox,
          now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
          utcOffsetMinutes: () => 0,
          randomSeed: () => 7,
        },
      }),
      annotationPlugin(),
      formPlugin(),
    ],
  });
  const bytes = new Uint8Array(await readFile(fixturePath));
  await kernel.documents.open(
    { kind: 'bytes', id: 'doc-events', bytes },
    options.scope ? ({ scope: options.scope } as never) : undefined,
  );
  const form = kernel.capability(FormToken);
  const actions = kernel.capability(ActionsToken);
  await form.refresh();
  const valueOf = (name: string): string => {
    const field = form.getSnapshot()?.fields.find((candidate) => candidate.name === name);
    return field?.valueEntry.kind === 'scalar' ? field.valueEntry.value : '';
  };
  const diagnostics: ActionDiagnostic[] = [];
  actions.onDiagnostic((diagnostic) => diagnostics.push(diagnostic));
  return {
    kernel,
    form,
    actions,
    valueOf: valueOf,
    diagnostics,
    async [Symbol.asyncDispose]() {
      await kernel.destroy();
      await engine.destroy();
    },
  };
}

/** Inspect saved bytes with scripting fully off (no VM, no open sequence)
 *  so inspection can never mutate what it measures. */
async function readSavedFields(bytes: Uint8Array): Promise<Record<string, string>> {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const kernel = createKernel({
    engine,
    plugins: [
      interactionPlugin(),
      actionsPlugin({ openSequence: 'off' }),
      annotationPlugin(),
      formPlugin(),
    ],
  });
  await kernel.documents.open({ kind: 'bytes', id: 'saved-inspection', bytes });
  const form = kernel.capability(FormToken);
  await form.refresh();
  const out: Record<string, string> = {};
  for (const field of form.getSnapshot()?.fields ?? []) {
    out[field.name] = field.valueEntry.kind === 'scalar' ? field.valueEntry.value : '';
  }
  await kernel.destroy();
  await engine.destroy();
  return out;
}

describe('document lifecycle actions (WS/DS/WP/DP/WC) on a real document', () => {
  it('the save proof: OpenAction-before-WS, WS in the bytes, DS not — DS rides the NEXT save', async () => {
    // openSequence 'auto' with no adapter installed: the open latch is still
    // armed when the first save arrives, so OpenAction must run first.
    await using harness = await boot({ openSequence: 'auto' });
    expect(harness.valueOf('eventLog')).toBe(''); // nothing ran yet

    const bytes = await harness.actions.runDocumentVerb('save', () =>
      harness.kernel.documents.save('doc-events'),
    );

    // The saved bytes show OpenAction ran before WillSave, the document-level
    // names resolve, event.target is the document, and DidSave is absent
    // (it fired after the bytes were pulled).
    const saved = await readSavedFields(bytes);
    expect(saved.eventLog).toBe('Open WillSave');
    expect(saved.savedAt).toBe('saved-by-willsave');

    // The live document carries the DidSave write...
    await harness.form.refresh();
    expect(harness.valueOf('eventLog')).toBe('Open WillSave DidSave');

    // ...and the next save includes it (plus its own WillSave).
    const bytes2 = await harness.actions.runDocumentVerb('save', () =>
      harness.kernel.documents.save('doc-events'),
    );
    const saved2 = await readSavedFields(bytes2);
    expect(saved2.eventLog).toBe('Open WillSave DidSave WillSave');
  });

  it('the print proof: WP before the dialog, DP after; the WP script print() is reentrant-suppressed', async () => {
    await using harness = await boot({ openSequence: 'off' });
    let duringOp = '';
    await harness.actions.runDocumentVerb('print', async () => {
      // Mid-operation truth: WillPrint has run, DidPrint has not.
      await harness.form.refresh();
      duringOp = harness.valueOf('eventLog');
    });
    expect(duringOp).toBe('WillPrint');
    await harness.form.refresh();
    expect(harness.valueOf('eventLog')).toBe('WillPrint DidPrint');
    // The fixture's WP script calls this.print() — while the verb holds the
    // latch that request is suppressed (one dialog per outer request).
    expect(harness.diagnostics.some((diagnostic) => diagnostic.code === 'reentrant-print')).toBe(
      true,
    );
  });

  it('prepareClose runs WC as a document mutation, then closing works', async () => {
    await using harness = await boot({ openSequence: 'off' });
    const result = await harness.actions.prepareClose();
    expect(result.status).toBe('executed');
    await harness.form.refresh();
    expect(harness.valueOf('eventLog')).toBe('WillClose');
    await harness.kernel.documents.close('doc-events');
  });

  it('unauthorized: the WS script runs, every write is refused, nothing changes', async () => {
    await using harness = await boot({
      openSequence: 'off',
      scope: ['doc.open', 'doc.render', 'doc.forms.read', 'doc.annotate.read'],
    });
    const result = await harness.actions.dispatch({ scope: 'document', event: 'will-save' });
    expect(result.status).not.toBe('executed'); // the script's commit failed
    await harness.form.refresh();
    expect(harness.valueOf('eventLog')).toBe(''); // byte-stable
    expect(harness.valueOf('savedAt')).toBe('');
    expect(harness.diagnostics.some((diagnostic) => diagnostic.code === 'executor-failed')).toBe(
      true,
    );
  });
});
