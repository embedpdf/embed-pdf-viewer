import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';
import { actionsPlugin, ActionsToken } from '@embedpdf/plugin-actions';
import type { ActionDiagnostic, ActionSubmitRequest } from '@embedpdf/plugin-actions';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { fieldKeyOf } from '../src/core/model';
import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/types';

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
  'action_submit_form.pdf',
);

/**
 * THE Phase-4 submit gate on a real engine: SubmitForm buttons (and a
 * scripted doc.submitForm) resolve ISO-exact datasets through the form
 * resolver and land in the embedder handler — the sink chain's consent
 * boundary. Nothing auto-networks; without a sink the node blocks with a
 * named diagnostic.
 */
async function boot() {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const kernel = createKernel({
    engine,
    plugins: [
      interactionPlugin(),
      actionsPlugin({
        openSequence: 'off',
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
  await kernel.documents.open({ kind: 'bytes', id: 'submit-form', bytes });
  const form = kernel.capability(FormToken);
  const actions = kernel.capability(ActionsToken);
  await form.refresh();
  const fieldOf = (name: string) => {
    const field = form.snapshot()?.fields.find((candidate) => candidate.name === name);
    if (!field) throw new Error(`field '${name}' is missing`);
    return field;
  };
  const widgetRefOf = (name: string): AnnotationRef => {
    const widget = fieldOf(name).widgets[0]!;
    return {
      kind: 'objectNumber',
      pageObjectNumber: widget.pageObjectNumber,
      annotObjectNumber: widget.annotObjectNumber,
    };
  };
  const press = (name: string) => form.activateWidget(fieldKeyOf(fieldOf(name)), widgetRefOf(name));
  const requests: ActionSubmitRequest[] = [];
  const diagnostics: ActionDiagnostic[] = [];
  actions.onDiagnostic((diagnostic) => diagnostics.push(diagnostic));
  return {
    form,
    actions,
    press,
    requests,
    diagnostics,
    installHandler: () => actions.setSubmitHandler((request) => void requests.push(request)),
    async [Symbol.asyncDispose]() {
      await kernel.destroy();
      await engine.destroy();
    },
  };
}

describe('the Phase-4 submit gate: ISO-exact datasets to the embedder handler', () => {
  it('btnParent: an included parent NAME submits its descendants (Table 239)', async () => {
    await using t = await boot();
    t.installHandler();
    await t.press('btnParent');
    expect(t.requests).toHaveLength(1);
    const request = t.requests[0]!;
    expect(request).toMatchObject({
      url: 'https://home.test/parent',
      format: 'fdf',
      method: 'post',
      flagsRaw: 0,
      origin: 'user',
    });
    expect(request.entries).toEqual([
      { name: 'parent.c1', value: 'child-one' },
      { name: 'parent.c2', value: 'child-two' },
    ]);
  });

  it('btnAll: /Fields absent submits everything eligible — NoExport and push-buttons out, name-only entries in', async () => {
    await using t = await boot();
    t.installHandler();
    await t.press('btnAll');
    const request = t.requests[0]!;
    // Flags 2 = IncludeNoValueFields: the valueless field submits by name.
    expect(request.entries).toEqual([
      { name: 'parent.c1', value: 'child-one' },
      { name: 'parent.c2', value: 'child-two' },
      { name: 'empty', value: null },
      { name: 'plain', value: 'visible' },
    ]);
    // Implicit sweeps stay quiet — the ISO defaults are not diagnostic noise.
    expect(t.diagnostics.filter((d) => d.code === 'submit-entry-unsupported')).toHaveLength(0);
  });

  it('btnVeto: NoExport beats an explicit include; an explicit push-button is diagnosed', async () => {
    await using t = await boot();
    t.installHandler();
    await t.press('btnVeto');
    const request = t.requests[0]!;
    expect(request.entries).toEqual([{ name: 'plain', value: 'visible' }]);
    const unsupported = t.diagnostics.filter((d) => d.code === 'submit-entry-unsupported');
    expect(unsupported.some((d) => /NoExport/.test(d.message))).toBe(true);
    expect(unsupported.some((d) => /pushbutton/.test(d.message))).toBe(true);
  });

  it('btnJs: doc.submitForm({...}) rides the SAME pipeline with include-mode names', async () => {
    await using t = await boot();
    t.installHandler();
    await t.press('btnJs');
    expect(t.requests).toHaveLength(1);
    const request = t.requests[0]!;
    expect(request).toMatchObject({ url: 'https://home.test/js', format: 'xfdf' });
    expect(request.entries).toEqual([{ name: 'plain', value: 'visible' }]);
  });

  it('no sink installed: the node blocks with no-submit-sink — nothing ever leaves the viewer', async () => {
    await using t = await boot();
    await t.press('btnParent');
    expect(t.requests).toHaveLength(0);
    expect(t.diagnostics.some((d) => d.code === 'no-submit-sink')).toBe(true);
  });
});
