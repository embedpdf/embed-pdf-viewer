/**
 * The scripts' engine (QuickJS) starts only for a form with scripts: a form without them is
 * filled in without it, and a form with them starts it when its first field takes focus, so
 * the first commit doesn't wait for it.
 */
import { createKernel, type Engine } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';
import { actionsPlugin } from '@embedpdf/plugin-actions';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';
import { formBytes } from './helpers/fill-form';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

async function boot(bytes: Uint8Array) {
  const sandboxFactory = vi.fn(createQuickJsSandbox);
  const kernel = createKernel({
    engine,
    plugins: [
      interactionPlugin(),
      actionsPlugin({ javascript: { enabled: true, sandboxFactory } }),
      formPlugin(),
    ],
  });
  await kernel.documents.open({ kind: 'bytes', id: `warming-${Math.random()}`, bytes });
  const form = kernel.capability(FormToken);
  await form.refresh();
  const widgetOf = (name: string): AnnotationRef => {
    const field = form.get({ kind: 'fqn', name })!;
    const widget = field.widgets[0]!;
    return { kind: 'objectNumber', page: widget.page!, objectNumber: widget.objectNumber };
  };
  return { kernel, form, sandboxFactory, widgetOf };
}

describe('the scripts’ engine', () => {
  it('never starts for a form without scripts', async () => {
    const { kernel, form, sandboxFactory, widgetOf } = await boot(CHANGE_FIXTURE_PDF.slice());
    const name = form.get({ kind: 'fqn', name: 'name' })!;
    form.notifyWidgetEvent(name.ref, widgetOf('name'), 'focus');
    await form.setValue(name.ref, { value: 'Bea' });
    expect(form.get(name.ref)).toMatchObject({ value: 'Bea' });
    expect(sandboxFactory).not.toHaveBeenCalled();
    await kernel.destroy();
  });

  it('starts once, when the first field of a form with scripts takes focus', async () => {
    const { kernel, form, sandboxFactory, widgetOf } = await boot(await formBytes(engine));
    expect(sandboxFactory).not.toHaveBeenCalled();
    const a = form.get({ kind: 'fqn', name: 'a' })!;
    form.notifyWidgetEvent(a.ref, widgetOf('a'), 'focus');
    form.notifyWidgetEvent(a.ref, widgetOf('a'), 'blur');
    form.notifyWidgetEvent(a.ref, widgetOf('a'), 'focus');
    await vi.waitFor(() => expect(sandboxFactory).toHaveBeenCalledTimes(1));
    await form.setValue(a.ref, { value: '4' });
    expect(form.get({ kind: 'fqn', name: 'total' })).toMatchObject({ value: '4' });
    expect(sandboxFactory).toHaveBeenCalledTimes(1);
    await kernel.destroy();
  });
});
