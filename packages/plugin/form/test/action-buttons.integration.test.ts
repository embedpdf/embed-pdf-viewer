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
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/internal';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { fieldKeyOf } from '../src/core/model';
import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/types'; // the WIDE token — package-internal view
import type { WidgetActivationResult } from '../src/types';

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
 * The synthetic HIDE/SHOW/RESET/CHAIN buttons form through the FULL plugin
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
  const snapshot = form.snapshot();
  if (!snapshot) throw new Error('form snapshot did not load');
  const pon = snapshot.fields[0]!.widgets[0]!.pageObjectNumber;
  await annotation.reloadPage(pon); // hydrate the annotation plane for paint asserts

  const fieldOf = (name: string) => {
    const field = form.snapshot()?.fields.find((candidate) => candidate.name === name);
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
      pageObjectNumber: widget.pageObjectNumber,
      annotObjectNumber: widget.annotObjectNumber,
    };
  };
  const press = (name: string): Promise<WidgetActivationResult> =>
    form.activateWidget(fieldKeyOf(fieldOf(name)), widgetRefOf(name));
  const paintedIds = () => annotation.pageItems(pon).map((item) => item.id);
  const widgetId = (name: string) => `obj:${fieldOf(name).widgets[0]!.annotObjectNumber}`;
  const notify = (name: string, event: PdfAnnotationEventKind) =>
    form.notifyWidgetEvent(fieldKeyOf(fieldOf(name)), widgetRefOf(name), event);
  // notifyWidgetEvent is fire-and-forget; a bogus hover dispatch drains the
  // actions queue behind everything already submitted.
  const actions = kernel.capability(ActionsToken);
  const drainActions = () =>
    actions.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: { kind: 'objectNumber', pageObjectNumber: pon, annotObjectNumber: 999_999 },
      pon,
    });

  return {
    kernel,
    engine,
    form,
    actions,
    annotation,
    pon,
    fieldOf,
    valueOf,
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
    await using t = await boot(false);
    const alphaId = `obj:${t.fieldOf('alpha').widgets[0]!.annotObjectNumber}`;
    expect(t.paintedIds()).toContain(alphaId);

    const hide = await t.press('btn-hide');
    expect(hide.kind).toBe('dispatched');
    if (hide.kind !== 'dispatched') throw new Error('unreachable');
    // Phase 2: a dispatch returns per-step truth; the /A tree is one step.
    expect(hide.result.steps).toHaveLength(1);
    expect(hide.result.steps[0]!.result.nodes).toEqual([
      expect.objectContaining({ type: 'hide', status: 'executed' }),
    ]);
    expect(t.paintedIds()).not.toContain(alphaId);

    const show = await t.press('btn-show');
    expect(show.kind).toBe('dispatched');
    expect(t.paintedIds()).toContain(alphaId);
  });

  it('a READ-ONLY TEXT field with /A activates like a button (the fake-button pattern)', async () => {
    // The Test Lab's Reset/Next/Hide shape: /FT /Tx /Ff 1 styled as a
    // button, action on the widget /A. Activation is a WIDGET behavior
    // (ISO puts /A on the annotation dictionary) — field family and the
    // ReadOnly flag are irrelevant to it.
    await using t = await boot(false);
    const alphaId = `obj:${t.fieldOf('alpha').widgets[0]!.annotObjectNumber}`;
    expect(t.fieldOf('fakeButton').flags.readOnly).toBe(true);
    expect(t.paintedIds()).toContain(alphaId);

    const pressed = await t.press('fakeButton');
    expect(pressed.kind).toBe('dispatched');
    if (pressed.kind !== 'dispatched') throw new Error('unreachable');
    expect(pressed.result.steps[0]!.result.nodes).toEqual([
      expect.objectContaining({ type: 'hide', status: 'executed' }),
    ]);
    expect(t.paintedIds()).not.toContain(alphaId);
  });

  it('RESET with /Flags 1 resets the COMPLEMENT of the listed fields', async () => {
    await using t = await boot(false);
    expect(t.valueOf('alpha')).toBe('filled-a');
    expect(t.valueOf('beta')).toBe('filled-b');

    const reset = await t.press('btn-reset'); // excludes [alpha, log] → resets beta
    expect(reset.kind).toBe('dispatched');
    if (reset.kind !== 'dispatched') throw new Error('unreachable');
    expect(reset.result.steps[0]!.result.nodes).toEqual([
      expect.objectContaining({ type: 'reset-form', status: 'executed' }),
    ]);
    expect(t.valueOf('beta')).toBe('default-b');
    expect(t.valueOf('alpha')).toBe('filled-a'); // excluded — untouched
  });

  it('runs the ResetForm in a JS chain while the JS nodes stay inert', async () => {
    await using t = await boot(false);
    const chain = await t.press('btn-chain');
    expect(chain.kind).toBe('dispatched');
    if (chain.kind !== 'dispatched') throw new Error('unreachable');
    // JS inert (scripting off), the reset between them still executes.
    expect(chain.result.steps[0]!.result.nodes.map((n) => [n.type, n.status])).toEqual([
      ['javascript', 'inert'],
      ['reset-form', 'executed'],
      ['javascript', 'inert'],
    ]);
    expect(chain.result.status).toBe('executed'); // inert nodes never demote
    expect(t.valueOf('alpha')).toBe('default-a'); // include-mode [(alpha)]
    expect(t.valueOf('log')).toBe(''); // no script ran
  });
});

describe('action buttons e2e (scripting ON)', () => {
  it('runs JS→ResetForm→JS: each script once, in order, around the reset', async () => {
    await using t = await boot(true);
    const chain = await t.press('btn-chain');
    expect(chain.kind).toBe('dispatched');
    if (chain.kind !== 'dispatched') throw new Error('unreachable');
    expect(chain.result.steps[0]!.result.nodes.map((n) => [n.type, n.status])).toEqual([
      ['javascript', 'executed'],
      ['reset-form', 'executed'],
      ['javascript', 'executed'],
    ]);
    // 'A' before the reset, 'B' after — order AND exactly-once in one string.
    expect(t.valueOf('log')).toBe('AB');
    expect(t.valueOf('alpha')).toBe('default-a');
    expect(t.valueOf('beta')).toBe('filled-b');
  });

  it('never deadlocks a dispatch against a queued value commit (queue-direction law)', async () => {
    await using t = await boot(true);
    // Fire the chain and a value write concurrently: the dispatch runs on
    // the ACTIONS queue and its executors enter the form queue; the write
    // enters the form queue directly. form → actions → form would hang here.
    const dispatched = t.press('btn-chain');
    const committed = t.form.setText(fieldKeyOf(t.fieldOf('beta')), 'raced');
    const [chain] = await Promise.all([dispatched, committed]);
    expect(chain.kind).toBe('dispatched');
    expect(t.valueOf('log')).toBe('AB');
    expect(t.valueOf('beta')).toBe('raced');
  }, 20_000);
});

describe('widget /AA events (Phase 2/3 — the DOM-event feed, full ISO)', () => {
  it('runs the native tooltip via hover — a DOCUMENT mutation in an authorized session', async () => {
    await using t = await boot(false);
    const tipId = t.widgetId('tip');
    expect(t.paintedIds()).not.toContain(tipId); // /F hidden at rest

    t.notify('alpha', 'cursorEnter'); // alpha's /AA /E → Hide /H false (tip)
    await t.drainActions();
    expect(t.paintedIds()).toContain(tipId);

    t.notify('alpha', 'cursorExit'); // /X → Hide (tip)
    await t.drainActions();
    await t.drainActions(); // the pump settles, then delivers the exit
    expect(t.paintedIds()).not.toContain(tipId);
  });

  it('refuses the tooltip WITHOUT authority: the ISO permission model, honestly reported', async () => {
    // Full ISO (D7): a Hide is a document mutation — a read-only session's
    // hover runs the trigger, the engine refuses the write, diagnostics say
    // so, and NOTHING changes anywhere.
    await using t = await boot(false, [
      'doc.open',
      'doc.render',
      'doc.forms.read',
      'doc.annotate.read',
    ]);
    expect(t.form.canFill()).toBe(false); // the scope really is narrowed
    const tipId = t.widgetId('tip');
    expect(t.paintedIds()).not.toContain(tipId);

    const diagnostics: string[] = [];
    t.actions.onDiagnostic((d) => diagnostics.push(`${d.code}:${d.message}`));
    t.notify('alpha', 'cursorEnter');
    await t.drainActions();
    expect(t.paintedIds()).not.toContain(tipId); // refused — byte-stable view
    expect(diagnostics.some((d) => d.includes('executor-failed'))).toBe(true);
  });

  it('dispatches Fo/Bl and D/U; /A shadows /AA U on the buttons (ISO Table 197)', async () => {
    await using t = await boot(false);
    const alphaId = t.widgetId('alpha');
    const logId = t.widgetId('log');

    t.notify('beta', 'focus'); // /Fo → Hide (alpha)
    await t.drainActions();
    expect(t.paintedIds()).not.toContain(alphaId);
    t.notify('beta', 'blur'); // /Bl → Hide /H false (alpha)
    await t.drainActions();
    expect(t.paintedIds()).toContain(alphaId);

    t.notify('beta', 'mouseDown'); // /D → Hide (log)
    await t.drainActions();
    expect(t.paintedIds()).not.toContain(logId);
    t.notify('beta', 'mouseUp'); // /U → Hide /H false (log) — beta has NO /A
    await t.drainActions();
    expect(t.paintedIds()).toContain(logId);

    // btn-hide HAS /A — its /AA U (none here) and any U would be shadowed;
    // the dispatch is inert and, critically, the /A tree does NOT run.
    t.notify('btn-hide', 'mouseUp');
    await t.drainActions();
    expect(t.paintedIds()).toContain(alphaId); // the /A Hide did not fire
  });
});
