import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import type { FormSnapshot } from '@embedpdf/engine-core/runtime';

import { createFormScriptingController } from '../src/scripting';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, 'fixtures', 'action_form_fixture.pdf');

function scalar(snapshot: FormSnapshot, name: string): string {
  const field = snapshot.fields.find((candidate) => candidate.name === name);
  if (!field) throw new Error(`field '${name}' is missing`);
  return field.valueEntry.kind === 'scalar' ? field.valueEntry.value : '';
}

/**
 * The synthetic action form is the AF-library acceptance fixture: calc1/calc2 carry
 * `/AA /K` AFNumber_Keystroke + `/F` AFNumber_Format, and read-only calcsum
 * carries `/C` AFSimple_Calculate("SUM", calc1, calc2) via /CO.
 */
describe('synthetic action form AF library acceptance', () => {
  it('runs the AF keystroke, format, and calculate chain end-to-end', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open(
      {
        kind: 'bytes',
        id: 'action-form-fixture',
        bytes: new Uint8Array(await readFile(fixturePath)),
      },
      { scope: ['*'] },
    );
    const pages = await doc.pages.list();
    const controller = createFormScriptingController({
      doc,
      document: () => ({
        id: doc.id,
        name: 'action_form_fixture.pdf',
        pageCount: pages.pageCount,
        pages: pages.pages,
        revision: 0,
      }),
      config: {
        now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
        utcOffsetMinutes: () => 180,
        randomSeed: () => 7,
        sandboxFactory: createQuickJsSandbox,
      },
    });

    try {
      const initial = await doc.forms.list();
      expect(scalar(initial, 'calcsum')).toBe('0');
      const calc1 = initial.fields.find(({ name }) => name === 'calc1');
      const calc2 = initial.fields.find(({ name }) => name === 'calc2');
      const email = initial.fields.find(({ name }) => name === 'email');
      if (!calc1 || !calc2 || !email) throw new Error('expected synthetic fields are missing');

      // The bug this fixture exposed: typing 12 must survive the K action.
      const first = await controller.commit(calc1.ref, { type: 'text', value: '12' });
      expect(first.status).toBe('applied');
      expect(first.error).toBeUndefined();
      const afterFirst = await doc.forms.list();
      expect(scalar(afterFirst, 'calc1')).toBe('12');
      expect(scalar(afterFirst, 'calcsum')).toBe('12');

      const second = await controller.commit(calc2.ref, { type: 'text', value: '12' });
      expect(second.status).toBe('applied');
      const afterSecond = await doc.forms.list();
      expect(scalar(afterSecond, 'calc2')).toBe('12');
      // AFSimple_Calculate("SUM") through the read-only /CO target.
      expect(scalar(afterSecond, 'calcsum')).toBe('24');

      // AFNumber_Keystroke rejects garbage with Acrobat's alert; value survives.
      const rejected = await controller.commit(calc1.ref, {
        type: 'text',
        value: 'abc',
      });
      expect(rejected.status).toBe('rejected');
      expect(rejected.uiEffects).toContainEqual(
        expect.objectContaining({
          kind: 'alert',
          message: 'The value entered does not match the format of the field [ calc1 ]',
          phase: 'user',
        }),
      );
      const afterRejected = await doc.forms.list();
      expect(scalar(afterRejected, 'calc1')).toBe('12');
      expect(scalar(afterRejected, 'calcsum')).toBe('24');

      // The email validator alerts (app.alert works, app.beep degrades to a
      // diagnostic) but never sets rc=false, so the value still commits.
      const emailResult = await controller.commit(email.ref, {
        type: 'text',
        value: 'not-an-email',
      });
      expect(emailResult.status).toBe('applied');
      expect(emailResult.error).toBeUndefined();
      expect(emailResult.uiEffects).toContainEqual(
        expect.objectContaining({
          kind: 'alert',
          message: 'Please enter a valid email address. Received: "not-an-email".',
          phase: 'user',
        }),
      );
      expect(scalar(await doc.forms.list(), 'email')).toBe('not-an-email');
    } finally {
      controller.dispose();
      await doc.close();
      await engine.destroy();
    }
  });
});
