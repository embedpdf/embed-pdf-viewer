import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import { toPageRef, type PdfActionNode, type PdfActionTree } from '@embedpdf/engine-core/runtime';

import { actionsPlugin } from '../src/actions.plugin';
import { ActionsToken } from '../src/host-contract';
import type { ActionsHostCapability, AnnotCommitEntry } from '../src/host-contract';

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
  'action_triggers.pdf',
);

const tree = (root: PdfActionNode): PdfActionTree => ({
  root,
  incomplete: false,
  warningFlags: 0,
  warnings: [],
});
const script = (source: string, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'javascript',
  subtype: 'JavaScript',
  script: source,
  next,
});

async function boot() {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const kernel = createKernel({
    engine,
    plugins: [
      actionsPlugin({
        openSequence: 'off',
        javascript: {
          enabled: true,
          sandboxFactory: createQuickJsSandbox,
          now: () => Date.UTC(2026, 6, 15),
          utcOffsetMinutes: () => 0,
          randomSeed: () => 7,
          maxScriptNodesPerDispatch: 3,
        },
      }),
    ],
  });
  const bytes = new Uint8Array(await readFile(fixturePath));
  await kernel.documents.open({ kind: 'bytes', id: 'scripthost', bytes });
  const actions = kernel.capability(ActionsToken) as ActionsHostCapability;
  const committed: AnnotCommitEntry[] = [];
  actions.registerAnnotCommitSink(async (entries) => {
    committed.push(...entries);
    return {
      results: entries.map((entry) => ({
        annotObjectNumber: entry.annotObjectNumber,
        status: 'applied' as const,
      })),
    };
  });
  return {
    actions,
    committed,
    async [Symbol.asyncDispose]() {
      await kernel.destroy();
      await engine.destroy();
    },
  };
}

const hoverContext = {
  origin: 'hover' as const,
  source: {
    kind: 'annotation' as const,
    annotation: { kind: 'objectNumber' as const, page: toPageRef(3), annotObjectNumber: 5 },
    page: toPageRef(3),
  },
  event: { scope: 'annotation' as const, name: 'cursorEnter' as const },
};

describe('the ScriptHost executor (real VM, real engine world)', () => {
  it("runs 02's shape end-to-end: getAnnot → recolor → the annotation commit sink", async () => {
    await using booted = await boot();
    const result = await booted.actions.execute(
      tree(
        script(
          `var a = this.getAnnot(0, 'tip');
           if (a) { a.strokeColor = ['RGB', 0.14, 0.43, 0.89]; a.contents = event.type + ':' + event.name; }`,
        ),
      ),
      hoverContext,
    );
    expect(result.nodes[0]?.status).toBe('executed');
    expect(booted.committed).toHaveLength(1);
    expect(booted.committed[0]).toMatchObject({
      annotObjectNumber: 6, // the `tip` square
      page: toPageRef(3),
      patch: {
        strokeColor: ['RGB', 0.14, 0.43, 0.89],
        // Trigger provenance reached the VM: an Annot-plane hover event.
        contents: 'Annot:Mouse Enter',
      },
    });
  });

  it('reports refused commits as failed nodes', async () => {
    await using booted = await boot();
    booted.actions.registerAnnotCommitSink(async (entries) => ({
      results: entries.map((entry) => ({
        annotObjectNumber: entry.annotObjectNumber,
        status: 'failed' as const,
        error: 'PermissionDenied: doc.annotate.modify',
      })),
    }));
    const result = await booted.actions.execute(
      tree(script(`var a = this.getAnnot(0, 'tip'); if (a) a.opacity = 0.5;`)),
      hoverContext,
    );
    expect(result.nodes[0]?.status).toBe('failed');
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.message.includes('PermissionDenied')),
    ).toBe(true);
  });

  it('caps JS nodes per dispatch deterministically', async () => {
    await using booted = await boot();
    const chain = tree(
      script('void 0;', [
        script('void 0;', [script('void 0;', [script('void 0;', [script('void 0;')])])]),
      ]),
    );
    const result = await booted.actions.execute(chain, hoverContext);
    const statuses = result.nodes.map((node) => node.status);
    expect(statuses.slice(0, 3)).toEqual(['executed', 'executed', 'executed']);
    expect(statuses.slice(3)).toEqual(['inert', 'inert']); // budget exhausted
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes('dispatch script budget exhausted'),
      ),
    ).toBe(true);
  });
});
