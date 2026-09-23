import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';
import { actionsPlugin, ActionsToken } from '@embedpdf/plugin-actions';
import type { PdfAnnotationEventKind } from '@embedpdf/plugin-actions';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract'; // the wide token — package-internal view
import type { WidgetActivationResult } from '../src/host-contract';

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
  'action_buttons_form.pdf',
);

/**
 * The synthetic hide, show, reset and chain buttons form through the full plugin
 * wiring: interaction + annotation + actions + form on one kernel. The
 * scripting-off half is the actions-≠-JavaScript proof — Hide and ResetForm
 * buttons must work with the VM disabled; the scripting-on half runs the
 * JS→ResetForm→JS chain (each script exactly once, in order) and the
 * queue-direction regression (a dispatch racing a queued value commit).
 */
async function boot(scripting: boolean, scope?: string[]) {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const kernel = createKernel({
    engine,
    plugins: [
      interactionPlugin(),
      actionsPlugin(
        scripting
          ? {
              javascript: {
                enabled: true,
                sandboxFactory: createQuickJsSandbox,
                now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
                utcOffsetMinutes: () => 180,
                randomSeed: () => 7,
              },
            }
          : {},
      ),
      annotationPlugin(),
      formPlugin(),
    ],
  });
  const bytes = new Uint8Array(await readFile(fixturePath));
  await kernel.documents.open(
    { kind: 'bytes', id: 'action-buttons', bytes },
    scope ? ({ scope } as never) : undefined,
  );
  const form = kernel.capability(FormToken);
  const annotation = kernel.capability(AnnotationHostToken);
  await form.refresh();
  const snapshot = form.getSnapshot();
  if (!snapshot) throw new Error('form snapshot did not load');
  const page = snapshot.fields[0]!.widgets[0]!.page!;
  await annotation.whenSynced(); // the annotation plugin has loaded the document

  const fieldOf = (name: string) => {
    const field = form.getSnapshot()?.fields.find((candidate) => candidate.name === name);
    if (!field) throw new Error(`field '${name}' is missing`);
    return field;
  };
  const valueOf = (name: string): string => {
    const field = fieldOf(name);
    return field.valueEntry.kind === 'scalar' ? field.valueEntry.value : '';
  };
  const widgetRefOf = (name: string): AnnotationRef => {
    const widget = fieldOf(name).widgets[0]!;
    return {
      kind: 'objectNumber',
      page: widget.page!,
      annotObjectNumber: widget.annotObjectNumber,
    };
  };
  const press = (name: string): Promise<WidgetActivationResult> =>
    form.activateWidget(widgetRefOf(name));
  const paintedIds = () => annotation.listPageItems(page).map((item) => item.id);
  const widgetId = (name: string) => `obj:${fieldOf(name).widgets[0]!.annotObjectNumber}`;
  const notify = (name: string, event: PdfAnnotationEventKind) =>
    form.notifyWidgetEvent(fieldOf(name).ref, widgetRefOf(name), event);
  // notifyWidgetEvent is fire-and-forget; a bogus hover dispatch drains the
  // actions queue behind everything already submitted.
  const actions = kernel.capability(ActionsToken);
  const drainActions = () =>
    actions.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: { kind: 'objectNumber', page, annotObjectNumber: 999_999 },
      page,
    });

  return {
    kernel,
    engine,
    form,
    actions,
    annotation,
    page,
    fieldOf,
    valueOf: valueOf,
    widgetRefOf,
    press,
    paintedIds,
    widgetId,
    notify,
    drainActions,
    async [Symbol.asyncDispose]() {
      await kernel.destroy();
      await engine.destroy();
    },
  };
}

describe('action buttons e2e (scripting OFF — actions ≠ JavaScript)', () => {
  it('HIDE session-hides the target widget; SHOW (/H false) restores it', async () => {
    await using harness = await boot(false);
    const alphaId = `obj:${harness.fieldOf('alpha').widgets[0]!.annotObjectNumber}`;
    expect(harness.paintedIds()).toContain(alphaId);

    const hide = await harness.press('btn-hide');
    expect(hide.kind).toBe('dispatched');
    if (hide.kind !== 'dispatched') throw new Error('unreachable');
    // A dispatch reports each step; the /A tree is one step.
    expect(hide.result.steps).toHaveLength(1);
    expect(hide.result.steps[0]!.result.nodes).toEqual([
      expect.objectContaining({ type: 'hide', status: 'executed' }),
    ]);
    expect(harness.paintedIds()).not.toContain(alphaId);

    const show = await harness.press('btn-show');
    expect(show.kind).toBe('dispatched');
    expect(harness.paintedIds()).toContain(alphaId);
  });

  it('a READ-ONLY TEXT field with /A activates like a button (the fake-button pattern)', async () => {
    // The Test Lab's Reset/Next/Hide shape: /FT /Tx /Ff 1 styled as a
    // button, action on the widget /A. Activation is a widget behavior
    // (ISO puts /A on the annotation dictionary) — field family and the
    // ReadOnly flag are irrelevant to it.
    await using harness = await boot(false);
    const alphaId = `obj:${harness.fieldOf('alpha').widgets[0]!.annotObjectNumber}`;
    expect(harness.fieldOf('fakeButton').flags.readOnly).toBe(true);
    expect(harness.paintedIds()).toContain(alphaId);

    const pressed = await harness.press('fakeButton');
    expect(pressed.kind).toBe('dispatched');
    if (pressed.kind !== 'dispatched') throw new Error('unreachable');
    expect(pressed.result.steps[0]!.result.nodes).toEqual([
      expect.objectContaining({ type: 'hide', status: 'executed' }),
    ]);
    expect(harness.paintedIds()).not.toContain(alphaId);
  });

  it('RESET with /Flags 1 resets the COMPLEMENT of the listed fields', async () => {
    await using harness = await boot(false);
    expect(harness.valueOf('alpha')).toBe('filled-a');
    expect(harness.valueOf('beta')).toBe('filled-b');

    const reset = await harness.press('btn-reset'); // excludes [alpha, log] → resets beta
    expect(reset.kind).toBe('dispatched');
    if (reset.kind !== 'dispatched') throw new Error('unreachable');
    expect(reset.result.steps[0]!.result.nodes).toEqual([
      expect.objectContaining({ type: 'reset-form', status: 'executed' }),
    ]);
    expect(harness.valueOf('beta')).toBe('default-b');
    expect(harness.valueOf('alpha')).toBe('filled-a'); // excluded — untouched
  });

  it('runs the ResetForm in a JS chain while the JS nodes stay inert', async () => {
    await using harness = await boot(false);
    const chain = await harness.press('btn-chain');
    expect(chain.kind).toBe('dispatched');
    if (chain.kind !== 'dispatched') throw new Error('unreachable');
    // JS inert (scripting off), the reset between them still executes.
    expect(chain.result.steps[0]!.result.nodes.map((node) => [node.type, node.status])).toEqual([
      ['javascript', 'inert'],
      ['reset-form', 'executed'],
      ['javascript', 'inert'],
    ]);
    expect(chain.result.status).toBe('executed'); // inert nodes never demote
    expect(harness.valueOf('alpha')).toBe('default-a'); // include-mode [(alpha)]
    expect(harness.valueOf('log')).toBe(''); // no script ran
  });
});

describe('action buttons e2e (scripting ON)', () => {
  it('runs JS→ResetForm→JS: each script once, in order, around the reset', async () => {
    await using harness = await boot(true);
    const chain = await harness.press('btn-chain');
    expect(chain.kind).toBe('dispatched');
    if (chain.kind !== 'dispatched') throw new Error('unreachable');
    expect(chain.result.steps[0]!.result.nodes.map((node) => [node.type, node.status])).toEqual([
      ['javascript', 'executed'],
      ['reset-form', 'executed'],
      ['javascript', 'executed'],
    ]);
    // 'A' before the reset, 'B' after — order and exactly-once in one string.
    expect(harness.valueOf('log')).toBe('AB');
    expect(harness.valueOf('alpha')).toBe('default-a');
    expect(harness.valueOf('beta')).toBe('filled-b');
  });

  it('never deadlocks a dispatch against a queued value commit (queue-direction law)', async () => {
    await using harness = await boot(true);
    // Fire the chain and a value write concurrently: the dispatch runs on
    // the actions queue and its executors enter the form queue; the write
    // enters the form queue directly. form → actions → form would hang here.
    const dispatched = harness.press('btn-chain');
    const committed = harness.form.setText(harness.fieldOf('beta').ref, 'raced');
    const [chain] = await Promise.all([dispatched, committed]);
    expect(chain.kind).toBe('dispatched');
    expect(harness.valueOf('log')).toBe('AB');
    expect(harness.valueOf('beta')).toBe('raced');
  }, 20_000);
});

describe('widget /AA events (Phase 2/3 — the DOM-event feed, full ISO)', () => {
  it('runs the native tooltip via hover — a DOCUMENT mutation in an authorized session', async () => {
    await using harness = await boot(false);
    const tipId = harness.widgetId('tip');
    expect(harness.paintedIds()).not.toContain(tipId); // /F hidden at rest

    harness.notify('alpha', 'cursorEnter'); // alpha's /AA /E → Hide /H false (tip)
    await harness.drainActions();
    expect(harness.paintedIds()).toContain(tipId);

    harness.notify('alpha', 'cursorExit'); // /X → Hide (tip)
    await harness.drainActions();
    await harness.drainActions(); // the pump settles, then delivers the exit
    expect(harness.paintedIds()).not.toContain(tipId);
  });

  it('refuses the tooltip WITHOUT authority: the ISO permission model, honestly reported', async () => {
    // A Hide action is a document mutation: a read-only session's
    // hover runs the trigger, the engine refuses the write, diagnostics say
    // so, and nothing changes anywhere.
    await using harness = await boot(false, [
      'doc.open',
      'doc.render',
      'doc.forms.read',
      'doc.annotate.read',
    ]);
    expect(harness.form.canFill()).toBe(false); // the scope really is narrowed
    const tipId = harness.widgetId('tip');
    expect(harness.paintedIds()).not.toContain(tipId);

    const diagnostics: string[] = [];
    harness.actions.onDiagnostic((diagnostic) =>
      diagnostics.push(`${diagnostic.code}:${diagnostic.message}`),
    );
    harness.notify('alpha', 'cursorEnter');
    await harness.drainActions();
    expect(harness.paintedIds()).not.toContain(tipId); // refused — byte-stable view
    expect(diagnostics.some((diagnostic) => diagnostic.includes('executor-failed'))).toBe(true);
  });

  it('dispatches Fo/Bl and D/U; /A shadows /AA U on the buttons (ISO Table 197)', async () => {
    await using harness = await boot(false);
    const alphaId = harness.widgetId('alpha');
    const logId = harness.widgetId('log');

    harness.notify('beta', 'focus'); // /Fo → Hide (alpha)
    await harness.drainActions();
    expect(harness.paintedIds()).not.toContain(alphaId);
    harness.notify('beta', 'blur'); // /Bl → Hide /H false (alpha)
    await harness.drainActions();
    expect(harness.paintedIds()).toContain(alphaId);

    harness.notify('beta', 'mouseDown'); // /D → Hide (log)
    await harness.drainActions();
    expect(harness.paintedIds()).not.toContain(logId);
    harness.notify('beta', 'mouseUp'); // /U → Hide /H false (log) — beta has no /A
    await harness.drainActions();
    expect(harness.paintedIds()).toContain(logId);

    // btn-hide has /A — its /AA U (none here) and any U would be shadowed;
    // the dispatch is inert and, critically, the /A tree does not run.
    harness.notify('btn-hide', 'mouseUp');
    await harness.drainActions();
    expect(harness.paintedIds()).toContain(alphaId); // the /A Hide did not fire
  });
});
