/**
 * Randomized interleavings of fills on the change queue, on a real engine with the form's real
 * scripts: values typed into two fields whose total a calculate script keeps, a checkbox
 * clicked, resets, the engine's answers held and given in the order the changes were sent (as
 * both engines answer), some refused, and another session's fills arriving meanwhile.
 *
 * After every step:
 *   - each field shows the newest of this session's fills of it the engine hasn't answered,
 *     or else the engine's value, from the moment the fill was asked for: a value shows at once
 *     and never reverts while it is on its way;
 *   - once the scripts have run, the total the view shows is the sum the view shows, refused
 *     fills included: a refusal runs the calculations again.
 * Once everything is answered, the view is the engine's form, and its total is its sum.
 */
import { createKernel, type DocumentHandle } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import type { FormFieldRef } from '@embedpdf/engine-core/runtime';
import { actionsPlugin } from '@embedpdf/plugin-actions';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { describe, expect, it, vi } from 'vitest';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';
import { formBytes, gated, valueOf, type HeldChange } from './helpers/fill-form';

/** A small seeded generator (mulberry32), so a failure replays exactly. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]! };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type Field = 'a' | 'b' | 'agree' | 'name';

/** One fill this session asked for and the engine hasn't answered. */
interface OpenFill {
  readonly id: number;
  readonly values: Partial<Record<Field, string | boolean>>;
}

async function play(seed: number, steps: number) {
  const rng = random(seed);
  const real = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const bytes = await formBytes(real);
  const held: HeldChange[] = [];
  let inner: DocumentHandle | null = null;
  const kernel = createKernel({
    engine: gated(real, held, (doc) => (inner = doc)),
    plugins: [
      interactionPlugin(),
      actionsPlugin({
        javascript: {
          enabled: true,
          sandboxFactory: createQuickJsSandbox,
          now: () => Date.UTC(2026, 9, 11, 9, 0, 0),
          utcOffsetMinutes: () => 0,
          randomSeed: () => seed,
        },
      }),
      formPlugin(),
    ],
  });
  await kernel.documents.open({ kind: 'bytes', id: 'fills', bytes });
  const form = kernel.capability(FormToken);
  await form.refresh();
  const engine = inner as DocumentHandle | null;
  if (!engine) throw new Error('the document did not open');

  const ref = (name: string): FormFieldRef => ({ kind: 'fqn', name });
  const shown = (name: string) => valueOf(form.get(ref(name)));
  const truth = async (): Promise<Record<string, string | boolean | undefined>> => {
    const { fields } = await engine.forms.list();
    return Object.fromEntries(fields.map((field) => [field.name, valueOf(field)]));
  };

  let nextId = 0;
  const open: OpenFill[] = [];
  /** Ask for a fill: it is open until its promise settles. */
  const asked = (values: OpenFill['values'], run: () => Promise<unknown>) => {
    const fill: OpenFill = { id: nextId++, values };
    open.push(fill);
    void run()
      .catch(() => undefined)
      .finally(() => open.splice(open.indexOf(fill), 1));
  };

  const expected = (name: Field, engineValue: string | boolean | undefined) => {
    const newest = open.filter((fill) => name in fill.values).at(-1);
    return newest ? newest.values[name] : engineValue;
  };
  const check = async (label: string) => {
    const engineForm = await truth();
    for (const name of ['a', 'b', 'agree', 'name'] as const) {
      expect(shown(name), `${label}: ${name}`).toBe(expected(name, engineForm[name]));
    }
    // The scripts run promptly once a fill's turn comes; then the total is the sum shown.
    await vi.waitFor(
      () => {
        expect(shown('total'), `${label}: total`).toBe(
          String(Number(shown('a')) + Number(shown('b'))),
        );
      },
      { timeout: 2000, interval: 5 },
    );
  };

  /** The engine answers the oldest change: applies it, or refuses it. */
  const answerOldest = async (accept: boolean) => {
    const write = held.shift()!;
    // A recalculation alone is never refused here: the engine refuses fills.
    const total = form.get(ref('total'))!.ref;
    const fills =
      'ops' in write.change &&
      write.change.ops.some(
        (op) =>
          op.type === 'forms.reset' ||
          (op.type === 'forms.setValue' && JSON.stringify(op.field) !== JSON.stringify(total)),
      );
    if (accept || !fills) {
      await engine.apply(write.change, write.options as never).then(write.resolve, write.reject);
    } else {
      write.reject(new Error('refused'));
    }
    await flush();
  };

  await check(`seed ${seed} start`);
  for (let step = 0; step < steps; step++) {
    const label = `seed ${seed} step ${step}`;
    const roll = rng.next();
    if (roll < 0.3) {
      const name = rng.pick(['a', 'b'] as const);
      const value = String(Math.floor(rng.next() * 10));
      asked({ [name]: value }, () => form.setValue(ref(name), { value }));
      // The value shows at once.
      expect(shown(name), `${label}: typed ${name}`).toBe(value);
    } else if (roll < 0.4) {
      const checked = !shown('agree');
      asked({ agree: checked }, () => form.setValue(ref('agree'), { checked }));
      expect(shown('agree'), `${label}: clicked`).toBe(checked);
    } else if (roll < 0.47) {
      const names = rng.next() < 0.5 ? (['a'] as const) : (['a', 'b'] as const);
      asked(Object.fromEntries(names.map((name) => [name, '0'])), () => form.reset(names.map(ref)));
    } else if (roll < 0.52) {
      asked({ a: '1', b: '2' }, () =>
        form.setValues([
          { ref: ref('a'), value: { value: '1' } },
          { ref: ref('b'), value: { value: '2' } },
        ]),
      );
    } else if (roll < 0.85 && held.length > 0) {
      await answerOldest(rng.next() < 0.75);
    } else {
      // Another session fills in a field the total doesn't read.
      await engine.apply({
        ops: [{ type: 'forms.setValue', field: ref('name'), value: { value: `them ${step}` } }],
      });
    }
    await flush();
    await check(label);
  }

  // Answer everything still on its way, in order.
  for (let round = 0; held.length > 0 || open.length > 0; round++) {
    if (held.length > 0) await answerOldest(true);
    else await flush();
    if (round > 500) throw new Error(`seed ${seed}: fills never settled`);
  }
  await check(`seed ${seed} drain`);
  const engineForm = await truth();
  for (const name of ['a', 'b', 'total', 'agree', 'name']) {
    expect(shown(name), `seed ${seed} drain: ${name} is the engine's`).toBe(engineForm[name]);
  }
  expect(engineForm.total).toBe(String(Number(engineForm.a) + Number(engineForm.b)));
  await kernel.destroy();
  await real.destroy();
}

describe('fill interleavings', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}`, async () => {
      await play(seed, 60);
    }, 60_000);
  }
});
